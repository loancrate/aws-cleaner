import { asError } from "catch-unknown";
import "dotenv/config";
import { setImmediate } from "timers/promises";
import { ArnFields, parseArn } from "./arn.js";
import { getErrorMessage } from "./awserror.js";
import { Cache } from "./cache.js";
import { compare, compareNumericString } from "./compare.js";
import { EnvironmentFilter, getClosedPREnvironmentFilter, getEnvironmentFromName } from "./filter.js";
import { getPullRequestNumbers } from "./github.js";
import logger from "./logger.js";
import { getPoller } from "./poll.js";
import { getResourceHandler } from "./ResourceHandler.js";
import { listRoles, listRoleTags } from "./resources/iam.js";
import { getResources } from "./resources/tagging.js";
import { isResourceType, ResourceType } from "./ResourceType.js";
import { resourceTypeDependencies } from "./ResourceTypeDependencies.js";
import { SchedulerBuilder, Task } from "./scheduler.js";
import { getTerraformWorkspaces } from "./tfe.js";

const dryRun = false;
const ignoreResourceTypes = new Set<string>();
const maximumConcurrency = 20;
const continueAfterErrors = false;

const { GITHUB_TOKEN, TERRAFORM_CLOUD_TOKEN } = process.env;

const GITHUB_OWNER = "loancrate";
const GITHUB_REPOSITORY = "loancrate";
const TERRAFORM_CLOUD_ORGANIZATION = "loancrate";

interface Resource {
  arn: string;
  environment: string;
}

async function getEnvironmentResources(envFilter: EnvironmentFilter, cache: Cache): Promise<Resource[]> {
  const result: Resource[] = [];

  let resources = cache.getTaggedResources();
  if (!resources) {
    resources = await getResources();
    cache.setTaggedResources(resources);
  }

  let foundResources = 0;
  for (const resource of resources) {
    const environment = resource.Tags?.find((tag) => tag.Key === "Environment")?.Value;
    if (environment && envFilter(environment)) {
      result.push({ arn: resource.ResourceARN, environment });
      ++foundResources;
    }
  }
  logger.debug(`Found ${foundResources} resources from closed PRs`);

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
      const tags = await listRoleTags(role.RoleName);
      logger.debug({ tags }, `Fetched tags for role ${role.RoleName}`);
      environment = tags.find((tag) => tag.Key === "Environment")?.Value;
    }
    if (environment && envFilter(environment)) {
      result.push({ arn: role.Arn, environment });
      ++foundRoles;
    }
  }
  logger.debug(`Found ${foundRoles} roles from closed PRs`);

  return result;
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
) {
  const { resourceId } = arnFields;
  const { description, destroyer } = getResourceHandler(resourceType);
  if (destroyer) {
    let task: Task;
    if (dryRun) {
      task = () => {
        logger.info(`${environment}: Would destroy ${description} ${resourceId}`);
        return setImmediate();
      };
    } else {
      task = async () => {
        logger.info(`${environment}: Destroying ${description} ${resourceId}...`);
        try {
          await destroyer({ arn, ...arnFields, poller });
          if (resourceType === "iam.role") {
            cache.deleteRole(arn);
          } else {
            cache.deleteTaggedResource(arn);
          }
          logger.info(`${environment}: Destroyed ${description} ${resourceId}`);
        } catch (err) {
          logger.error(`${environment}: Error destroying ${description} ${resourceId}: ${getErrorMessage(err)}`);
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

const cache = new Cache();
await cache.load();
try {
  let workspaces = cache.getWorkspaces();
  if (!workspaces) {
    if (!TERRAFORM_CLOUD_TOKEN) {
      throw new Error("TERRAFORM_CLOUD_TOKEN not set");
    }
    workspaces = await getTerraformWorkspaces({
      token: TERRAFORM_CLOUD_TOKEN,
      organization: TERRAFORM_CLOUD_ORGANIZATION,
    });
    cache.setWorkspaces(workspaces);
  }
  logger.info(`Workspaces: ${workspaces.map((ws) => ws.name).join(", ")}`);

  let prNumbers = cache.getPullRequests();
  if (!prNumbers) {
    if (!GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN not set");
    }
    prNumbers = await getPullRequestNumbers({
      token: GITHUB_TOKEN,
      owner: GITHUB_OWNER,
      repository: GITHUB_REPOSITORY,
    });
    cache.setPullRequests(prNumbers);
  }
  logger.info(`Open PRs: ${prNumbers.openPRs.join(", ")}`);
  logger.info(`Last PR: ${prNumbers.lastPR}`);

  const closedPRFilter = getClosedPREnvironmentFilter(prNumbers, workspaces);

  const resources = await getEnvironmentResources(closedPRFilter, cache);

  summarizeResources(resources);

  const schedulerBuilder = new SchedulerBuilder(resourceTypeDependencies);
  const unrecognizedResourceTypeArns = new Map<string, string[]>();
  for (const resource of resources) {
    const { arn, environment } = resource;
    const arnFields = parseArn(arn);
    const { service, resourceType: subtype } = arnFields;
    if (ignoreResourceTypes.has(service)) continue;
    const resourceType = subtype ? `${service}.${subtype}` : service;
    if (ignoreResourceTypes.has(resourceType)) continue;
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
  await scheduler.execute({ maximumConcurrency, continueAfterErrors });
} catch (err) {
  logger.error(asError(err).message);
  process.exit(1);
} finally {
  await cache.save();
}
