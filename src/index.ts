import { asError } from "catch-unknown";
import { setImmediate, setTimeout as sleep } from "timers/promises";
import { ArnFields, makeArn, parseArn } from "./arn.js";
import { getErrorMessage } from "./awserror.js";
import { Cache } from "./cache.js";
import { compare, compareNumericString } from "./compare.js";
import { getConfiguration } from "./config.js";
import { getPullRequestNumbers } from "./github.js";
import logger from "./logger.js";
import { getPoller } from "./poll.js";
import { getResourceHandler } from "./ResourceHandler.js";
import { listTaskDefinitionFamilies } from "./resources/ecs.js";
import { listRoles, listRoleTags } from "./resources/iam.js";
import { getCallerIdentity } from "./resources/sts.js";
import { getResources } from "./resources/tagging.js";
import { isResourceType, ResourceType } from "./ResourceType.js";
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

function matchPatterns(s: string | null | undefined, patterns: (string | RegExp)[], group = 0): string | undefined {
  let result: string | undefined;
  if (s != null) {
    for (const pattern of patterns) {
      if (pattern instanceof RegExp) {
        const match = pattern.exec(s);
        result = match?.[group];
        break;
      }
      if (pattern === s) {
        result = s;
        break;
      }
    }
  }
  return result;
}

const configuration = await getConfiguration();

function getEnvironmentFromName(name: string): string | undefined {
  return (
    matchPatterns(name, configuration.protectedEnvironments) ??
    matchPatterns(name, configuration.targetEnvironments) ??
    matchPatterns(name, configuration.pullRequestEnvironments)
  );
}

function getPRNumberFromEnvironment(env: string): number | undefined {
  const n = matchPatterns(env, configuration.pullRequestEnvironments, 1);
  return n != null ? parseInt(n) : n;
}

type EnvironmentFilter = (env: string) => boolean;

interface Resource {
  arn: string;
  environment: string;
}

async function getEnvironmentResources(envFilter: EnvironmentFilter, cache: Cache): Promise<Resource[]> {
  const resources: Resource[] = [];

  let taggedResources = cache.getTaggedResources();
  if (!taggedResources) {
    taggedResources = await getResources();
    cache.setTaggedResources(taggedResources);
  }

  let foundResources = 0;
  for (const resource of taggedResources) {
    const environment = resource.Tags?.find((tag) => matchPatterns(tag.Key, configuration.awsEnvironmentTags))?.Value;
    if (environment && envFilter(environment)) {
      resources.push({ arn: resource.ResourceARN, environment });
      ++foundResources;
    }
  }
  logger.info(`Found ${foundResources} tagged resources matching filter`);

  let roles = cache.getRoles();
  if (!roles) {
    roles = await listRoles();
    cache.setRoles(roles);
  }

  let foundRoles = 0;
  for (const role of roles) {
    if (role.RoleName.startsWith("AWS")) continue;
    let environment = getEnvironmentFromName(role.RoleName);
    if (environment == null) {
      let tags = cache.getRoleTags(role.Arn);
      if (!tags) {
        tags = await listRoleTags(role.RoleName);
        cache.setRoleTags(role.Arn, tags);
      }
      logger.debug({ tags }, `Fetched tags for role ${role.RoleName}`);
      environment = tags.find((tag) => matchPatterns(tag.Key, configuration.awsEnvironmentTags))?.Value;
    }
    if (environment && envFilter(environment)) {
      resources.push({ arn: role.Arn, environment });
      ++foundRoles;
    }
  }
  logger.info(`Found ${foundRoles} roles matching filter`);

  const accountId = (await getCallerIdentity()).Account!;

  let allTaskDefinitionFamilies = cache.getTaskDefinitionFamilies();
  if (!allTaskDefinitionFamilies) {
    allTaskDefinitionFamilies = await listTaskDefinitionFamilies();
    cache.setTaskDefinitionFamilies(allTaskDefinitionFamilies);
  }

  let foundTaskDefinitionFamilies = 0;
  for (const family of allTaskDefinitionFamilies) {
    const environment = getEnvironmentFromName(family);
    if (environment && envFilter(environment)) {
      resources.push({
        arn: makeArn({
          partition: "aws",
          service: "ecs",
          region: "",
          accountId,
          resourceType: "task-definition-family",
          resourceId: family,
        }),
        environment,
      });
      ++foundTaskDefinitionFamilies;
    }
  }
  logger.info(`Found ${foundTaskDefinitionFamilies} task definition families matching filter`);

  return resources;
}

function summarizeResources(resources: Resource[]): void {
  const typeCounts = new Map<string, number>();
  const environmentCounts = new Map<string, number>();
  for (const resource of resources) {
    const { arn, environment } = resource;
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
    compareNumericString(a[0], b[0])
  )) {
    logger.info(`  ${environment}: ${count}`);
  }
}

interface ParsedResource extends Resource {
  arnFields: ArnFields;
}

const poller = getPoller();

async function addTask(
  { arn, arnFields, environment }: ParsedResource,
  resourceType: ResourceType,
  schedulerBuilder: SchedulerBuilder,
  cache: Cache
): Promise<void> {
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
  }
}

if (configuration.dryRun) {
  logger.info("This is a dry run -- nothing will be deleted");
} else {
  logger.warn("This is NOT a dry run! Press Ctrl-C now if you haven't already done a dry run!");
  await sleep(2000);
}

const cache = new Cache(configuration.cache);
await cache.load();
try {
  let prNumbers = cache.getPullRequests();
  if (configuration.github) {
    if (!prNumbers) {
      prNumbers = await getPullRequestNumbers(configuration.github);
      cache.setPullRequests(prNumbers);
    }
    logger.info(`Open PRs: ${prNumbers.openPRs.join(", ")}`);
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
    logger.info(`Workspaces: ${workspaces.map((ws) => ws.name).join(", ")}`);
  } else {
    logger.info("Terraform Cloud not configured");
  }

  const envFilter = (env: string): boolean => {
    if (matchPatterns(env, configuration.protectedEnvironments)) {
      return false;
    }
    if (matchPatterns(env, configuration.targetEnvironments)) {
      return true;
    }
    if (prNumbers && matchPatterns(env, configuration.pullRequestEnvironments)) {
      const { openPRs, lastPR } = prNumbers;
      const pr = getPRNumberFromEnvironment(env);
      return pr != null && pr <= lastPR && !openPRs.includes(pr);
    }
    return false;
  };

  if (workspaces && configuration.terraformCloud?.destroyWorkspaces) {
    const destroyedWorkspaceIds = new Set<string>();
    for (const workspace of workspaces) {
      const environment = getEnvironmentFromName(workspace.name);
      if (environment && envFilter(environment)) {
        if (configuration.dryRun) {
          logger.info(`${environment}: Would destroy Terraform workspace ${workspace.name}`);
        } else {
          const running = await isWorkspaceRunning(configuration.terraformCloud, workspace);
          if (!running) {
            logger.info(`${environment}: Destroying Terraform workspace ${workspace.name}...`);
            if (workspace.resourceCount > 0) {
              const destroyRun = await createDestroyRun(configuration.terraformCloud, workspace);
              if (destroyRun) {
                const status = await waitForRun(configuration.terraformCloud, destroyRun);
                if (status !== "applied") {
                  logger.error(`${environment}: Destroy run failed with status ${status}`);
                  continue;
                }
              }
            }
            await deleteWorkspace(configuration.terraformCloud, workspace);
            destroyedWorkspaceIds.add(workspace.id);
            logger.info(`${environment}: Destroyed Terraform workspace ${workspace.name}`);
          } else {
            logger.warn(`${environment}: Skipping destroy of locked Terraform workspace ${workspace.name}`);
          }
        }
      }
    }
    workspaces = workspaces.filter((ws) => !destroyedWorkspaceIds.has(ws.id));
  }

  // skip environments that are managed by a remaining Terraform workspace
  const envFilterSkipWorkspaces = (env: string): boolean => {
    return envFilter(env) && !workspaces?.some((ws) => ws.name.includes(env));
  };

  const resources = await getEnvironmentResources(envFilterSkipWorkspaces, cache);

  summarizeResources(resources);

  await cache.save();

  const schedulerBuilder = new SchedulerBuilder(resourceTypeDependencies);
  const unrecognizedResourceTypeArns = new Map<string, string[]>();
  for (const resource of resources) {
    const { arn, environment } = resource;
    const arnFields = parseArn(arn);
    const { service, resourceType: subtype } = arnFields;
    if (configuration.ignoreResourceTypes.has(service)) continue;
    const resourceType = subtype ? `${service}.${subtype}` : service;
    if (configuration.ignoreResourceTypes.has(resourceType)) continue;
    if (!isResourceType(resourceType)) {
      const arns = unrecognizedResourceTypeArns.get(resourceType);
      if (arns) {
        arns.push(arn);
      } else {
        unrecognizedResourceTypeArns.set(resourceType, [arn]);
      }
      continue;
    }
    await addTask({ arn, arnFields, environment }, resourceType, schedulerBuilder, cache);

    // untangle dependencies among security groups by deleting all their rules first
    if (resourceType === "ec2.security-group") {
      await addTask({ arn, arnFields, environment }, "ec2.security-group-rules", schedulerBuilder, cache);
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

  const scheduler = schedulerBuilder.build();
  await scheduler.execute(configuration);
} catch (err) {
  logger.error(err, asError(err).message);
  process.exit(1);
} finally {
  await cache.save();
}
