import { asError } from "catch-unknown";
import { setImmediate, setTimeout as sleep } from "timers/promises";
import { parseArn } from "./arn.js";
import { getErrorMessage } from "./awserror.js";
import { Cache } from "./cache.js";
import { compare, compareNumericString } from "./compare.js";
import { getConfiguration } from "./config.js";
import {
  EnvironmentFilter,
  getEnvironmentFromName,
  makeEnvironmentFilter,
  skipWorkspaceEnvironments,
} from "./environments.js";
import { getPullRequestNumbers } from "./github.js";
import logger from "./logger.js";
import { getPoller } from "./poll.js";
import { getResourceHandler } from "./ResourceHandler.js";
import { listInstances } from "./resources/ec2.js";
import { listTaskDefinitionFamilies } from "./resources/ecs.js";
import { ListRole, listRoles, listRoleTags } from "./resources/iam.js";
import {
  MatchContext,
  matchInstances,
  matchRoles,
  matchTaggedResources,
  matchTaskDefinitionFamilies,
  Resource,
} from "./resourceMatching.js";
import { getAwsAccount } from "./resources/sts.js";
import { getResources } from "./resources/tagging.js";
import { ec2SecurityGroupRules, isResourceType, ResourceType } from "./ResourceType.js";
import { resourceTypeDependencies } from "./ResourceTypeDependencies.js";
import { SchedulerBuilder, Task } from "./scheduler.js";
import {
  createDestroyRun,
  deleteWorkspace,
  getWorkspaces,
  isWorkspaceRunning,
  TerraformWorkspace,
  waitForRun,
} from "./tfe.js";

const configuration = await getConfiguration();

type ResourceEnvironmentMap = Map<string, Resource>;

async function getEnvironmentResources(
  envFilter: EnvironmentFilter,
  accountId: string,
  cache: Cache,
): Promise<ResourceEnvironmentMap> {
  const ctx: MatchContext = { config: configuration, filter: envFilter, accountId };
  const resources: ResourceEnvironmentMap = new Map();
  const add = (matched: Resource[]): number => {
    for (const resource of matched) {
      if (!resources.has(resource.arn)) {
        resources.set(resource.arn, resource);
      }
    }
    return matched.length;
  };

  let taggedResources = cache.getTaggedResources();
  if (!taggedResources) {
    taggedResources = await getResources();
    cache.setTaggedResources(taggedResources);
  }
  const foundResources = add(matchTaggedResources(taggedResources, ctx));
  logger.info(`Found ${foundResources} tagged resources matching filter`);

  let roles = cache.getRoles();
  if (!roles) {
    roles = await listRoles();
    cache.setRoles(roles);
  }
  const getRoleTags = async (role: ListRole) => {
    let tags = cache.getRoleTags(role.Arn);
    if (!tags) {
      tags = await listRoleTags(role.RoleName);
      cache.setRoleTags(role.Arn, tags);
    }
    logger.debug({ tags }, `Fetched tags for role ${role.RoleName}`);
    return tags;
  };
  const foundRoles = add(await matchRoles(roles, getRoleTags, ctx));
  logger.info(`Found ${foundRoles} roles matching filter`);

  let activeTaskDefinitionFamilies = cache.getActiveTaskDefinitionFamilies();
  if (!activeTaskDefinitionFamilies) {
    activeTaskDefinitionFamilies = await listTaskDefinitionFamilies();
    cache.setActiveTaskDefinitionFamilies(activeTaskDefinitionFamilies);
  }
  let foundTaskDefinitionFamilies = add(matchTaskDefinitionFamilies(activeTaskDefinitionFamilies, ctx));

  if (configuration.deleteInactiveTaskDefinitions) {
    let inactiveTaskDefinitionFamilies = cache.getInactiveTaskDefinitionFamilies();
    if (!inactiveTaskDefinitionFamilies) {
      inactiveTaskDefinitionFamilies = await listTaskDefinitionFamilies(undefined, "INACTIVE");
      cache.setInactiveTaskDefinitionFamilies(inactiveTaskDefinitionFamilies);
    }
    foundTaskDefinitionFamilies += add(
      matchTaskDefinitionFamilies(inactiveTaskDefinitionFamilies, ctx, { includeUnnamed: true }),
    );
  }
  logger.info(`Found ${foundTaskDefinitionFamilies} task definition families matching filter`);

  let instances = cache.getInstances();
  if (!instances) {
    instances = await listInstances();
    cache.setInstances(instances);
  }
  const foundInstances = add(matchInstances(instances, ctx));
  if (foundInstances > 0) {
    logger.info(`Found ${foundInstances} EC2 instances by name pattern matching filter`);
  }

  return resources;
}

function summarizeResources(resources: ResourceEnvironmentMap): void {
  const typeCounts = new Map<string, number>();
  const environmentCounts = new Map<string, number>();
  for (const [arn, { environment }] of resources) {
    const { service, resourceType } = parseArn(arn);
    const serviceType = resourceType ? `${service}.${resourceType}` : service;
    typeCounts.set(serviceType, (typeCounts.get(serviceType) ?? 0) + 1);
    environmentCounts.set(environment, (environmentCounts.get(environment) ?? 0) + 1);
  }
  logger.info("Resource types:");
  for (const [type, count] of Array.from(typeCounts.entries()).sort((a, b) => compare(a[0], b[0]))) {
    logger.info(`  ${type}: ${count}`);
  }
  logger.info("Environments:");
  for (const [environment, count] of Array.from(environmentCounts.entries()).sort((a, b) =>
    compareNumericString(a[0], b[0]),
  )) {
    logger.info(`  ${environment}: ${count}`);
  }
}

const poller = getPoller();

async function addTask(
  { arn, arnFields, environment }: Resource,
  resourceType: ResourceType,
  schedulerBuilder: SchedulerBuilder,
  cache: Cache,
): Promise<boolean> {
  const { resourceId } = arnFields;
  const { kind, describer, destroyer } = getResourceHandler(resourceType);
  const name = (describer && (await describer({ arn, ...arnFields }))) || resourceId;
  if (destroyer) {
    let task: Task;
    if (configuration.dryRun) {
      task = () => {
        logger.info(`${environment}: Would destroy ${kind} ${name}`);
        return setImmediate();
      };
    } else {
      task = async () => {
        logger.info(`${environment}: Destroying ${kind} ${name}...`);
        try {
          await destroyer({ arn, ...arnFields, poller });
          if (resourceType === "iam.role") {
            cache.deleteRole(arn);
          } else {
            cache.deleteTaggedResource(arn);
          }
          logger.info(`${environment}: Destroyed ${kind} ${name}`);
        } catch (err) {
          logger.error(`${environment}: Error destroying ${kind} ${name}: ${getErrorMessage(err)}`);
          throw err;
        }
      };
    }
    schedulerBuilder.addTask(task, {
      partitionKey: environment,
      category: resourceType,
      sortKey: resourceId,
    });
    return true;
  }
  return false;
}

const { accountId, region } = await getAwsAccount();
const awsTarget = `AWS account ${accountId} in ${region}`;
if (configuration.dryRun) {
  logger.info(`This is a dry run against ${awsTarget} -- nothing will be deleted`);
} else {
  logger.warn(
    `This is NOT a dry run! Resources in ${awsTarget} will be deleted. Press Ctrl-C now if you haven't already done a dry run!`,
  );
  await sleep(2000);
}

const cache = new Cache(configuration.cache);
await cache.load();
try {
  // A real run always fetches fresh PRs, since a PR reopened since they were cached would look closed
  let prNumbers = configuration.dryRun ? cache.getPullRequests() : undefined;
  if (configuration.github) {
    if (!prNumbers) {
      prNumbers = await getPullRequestNumbers(configuration.github);
      cache.setPullRequests(prNumbers);
    }
    logger.info(`Open PRs (${prNumbers.openPRs.length}): ${prNumbers.openPRs.join(", ")}`);
    logger.info(`Last PR: ${prNumbers.lastPR}`);
  } else {
    logger.info("GitHub not configured");
  }

  let workspaces: TerraformWorkspace[] | undefined;
  if (configuration.terraformCloud) {
    workspaces = cache.getWorkspaces();
    if (!workspaces) {
      workspaces = await getWorkspaces(configuration.terraformCloud);
      workspaces.sort((a, b) => compare(a.name, b.name));
      cache.setWorkspaces(workspaces);
    }
    logger.info(`Workspaces (${workspaces.length}): ${workspaces.map((ws) => ws.name).join(", ")}`);
  } else {
    logger.info("Terraform Cloud not configured");
  }

  const envFilter = makeEnvironmentFilter(configuration, prNumbers);

  if (workspaces && configuration.terraformCloud?.destroyWorkspaces) {
    const workspacesToDestroy = workspaces
      .flatMap((workspace) => {
        const environment = getEnvironmentFromName(workspace.name, configuration);
        return environment && envFilter(environment) ? [{ workspace, environment }] : [];
      })
      .sort((a, b) => compareNumericString(a.environment, b.environment));
    logger.info(
      `Terraform workspaces to destroy (${workspacesToDestroy.length}): ` +
        workspacesToDestroy.map(({ workspace, environment }) => `${environment} (${workspace.name})`).join(", "),
    );

    const destroyedWorkspaceIds = new Set<string>();
    for (const { workspace, environment } of workspacesToDestroy) {
      try {
        const running = await isWorkspaceRunning(configuration.terraformCloud, workspace);
        if (running) {
          logger.warn(`${environment}: Skipping destroy of locked Terraform workspace ${workspace.name}`);
        } else if (configuration.dryRun) {
          // Assume the destroy would succeed, so the dry run also lists the resources a real run
          // would delete directly once the workspace is gone
          logger.info(`${environment}: Would destroy Terraform workspace ${workspace.name}`);
          destroyedWorkspaceIds.add(workspace.id);
        } else {
          logger.info(`${environment}: Destroying Terraform workspace ${workspace.name}...`);
          if (workspace.resourceCount > 0) {
            const destroyRun = await createDestroyRun(configuration.terraformCloud, workspace);
            if (destroyRun) {
              const status = await waitForRun(configuration.terraformCloud, destroyRun);
              if (status !== "applied" && status !== "planned_and_finished") {
                logger.error(`${environment}: Destroy run failed with status ${status}`);
                continue;
              }
            }
          }
          await deleteWorkspace(configuration.terraformCloud, workspace);
          destroyedWorkspaceIds.add(workspace.id);
          logger.info(`${environment}: Destroyed Terraform workspace ${workspace.name}`);
        }
      } catch (err) {
        const action = configuration.dryRun ? "checking" : "destroying";
        logger.error(`${environment}: Error ${action} Terraform workspace ${workspace.name}: ${getErrorMessage(err)}`);
      }
    }
    workspaces = workspaces.filter((ws) => !destroyedWorkspaceIds.has(ws.id));
  }

  const resources = await getEnvironmentResources(
    configuration.terraformCloud?.destroyResources ? envFilter : skipWorkspaceEnvironments(envFilter, workspaces),
    accountId,
    cache,
  );

  summarizeResources(resources);

  await cache.save();

  const schedulerBuilder = new SchedulerBuilder(resourceTypeDependencies);
  const unrecognizedResourceTypeArns = new Map<string, string[]>();
  let resourcesToDelete = 0;
  const environmentsToDelete = new Set<string>();
  for (const [arn, { arnFields, environment }] of resources) {
    const { service, resourceType: subtype } = arnFields;
    if (configuration.ignoreResourceTypes.has(service)) {
      continue;
    }
    const resourceType = subtype ? `${service}.${subtype}` : service;
    if (configuration.ignoreResourceTypes.has(resourceType)) {
      continue;
    }
    if (!isResourceType(resourceType)) {
      const arns = unrecognizedResourceTypeArns.get(resourceType);
      if (arns) {
        arns.push(arn);
      } else {
        unrecognizedResourceTypeArns.set(resourceType, [arn]);
      }
      continue;
    }
    if (await addTask({ arn, arnFields, environment }, resourceType, schedulerBuilder, cache)) {
      ++resourcesToDelete;
      environmentsToDelete.add(environment);
    }

    // untangle dependencies among security groups by deleting all their rules first
    if (resourceType === "ec2.security-group") {
      await addTask({ arn, arnFields, environment }, ec2SecurityGroupRules, schedulerBuilder, cache);
    }
  }

  if (unrecognizedResourceTypeArns.size > 0) {
    const types = Array.from(unrecognizedResourceTypeArns.keys()).join(", ");
    logger.error(`Found ${unrecognizedResourceTypeArns.size} unrecognized resource types: ${types}`);
    for (const [type, arns] of unrecognizedResourceTypeArns.entries()) {
      logger.info(`Resource type ${type}:`);
      for (const arn of arns) {
        logger.info(`  ${arn}`);
      }
    }
    process.exit(1);
  }

  const deleteSummary = `${resourcesToDelete} resources in ${environmentsToDelete.size} environments from ${awsTarget}`;
  logger.info(`${configuration.dryRun ? "Would delete" : "Deleting"} ${deleteSummary}`);

  const scheduler = schedulerBuilder.build();
  await scheduler.execute(configuration);
} catch (err) {
  logger.error(err, asError(err).message);
  process.exit(1);
} finally {
  await cache.save();
}
