import { GetResourcesCommand, ResourceGroupsTaggingAPIClient } from "@aws-sdk/client-resource-groups-tagging-api";
import { asError } from "catch-unknown";
import "dotenv/config";
import { readFile, stat, writeFile } from "fs/promises";
import { setImmediate } from "timers/promises";
import { parseArn } from "./arn.js";
import { compareNumericString } from "./compare.js";
import { getPullRequestNumbers, PullRequestNumbers } from "./github.js";
import logger from "./logger.js";
import { pollPredicate } from "./poll.js";
import { getResourceHandler } from "./ResourceHandler.js";
import { isResourceType } from "./ResourceType.js";
import { resourceTypeDependencies } from "./ResourceTypeDependencies.js";
import { SchedulerBuilder, Task } from "./scheduler.js";
import { getTerraformWorkspaces, TerraformWorkspace } from "./tfe.js";

const dryRun = false;
const ignoreResourceTypes = new Set<string>();
const maximumConcurrency = 20;
const continueAfterErrors = false;
const resourcesJsonFile = "resources.json";

const { GITHUB_TOKEN, TERRAFORM_CLOUD_TOKEN } = process.env;

const GITHUB_OWNER = "loancrate";
const GITHUB_REPOSITORY = "loancrate";
const TERRAFORM_CLOUD_ORGANIZATION = "loancrate";

type EnvironmentFilter = (env: string) => boolean;

function getClosedPREnvironmentFilter(
  prNumbers: PullRequestNumbers,
  workspaces: TerraformWorkspace[]
): EnvironmentFilter {
  const { openPRs, lastPR } = prNumbers;
  return (env: string): boolean => {
    const match = /^pr-(\d+)$/i.exec(env);
    if (match) {
      const number = parseInt(match[1]);
      return number <= lastPR && !openPRs.includes(number) && !workspaces.some((ws) => ws.name.includes(env));
    }
    return false;
  };
}

interface Resource {
  arn: string;
  environment: string;
}

async function getEnvironmentResources(envFilter: EnvironmentFilter): Promise<Resource[]> {
  const result: Resource[] = [];
  const rgtClient = new ResourceGroupsTaggingAPIClient({});
  for (let PaginationToken: string | undefined, count = 0; ; ) {
    const command = new GetResourcesCommand({
      PaginationToken,
      ResourcesPerPage: 100,
    });
    const response = await rgtClient.send(command);
    if (response.ResourceTagMappingList) {
      const resources = response.ResourceTagMappingList;
      count += resources.length;
      for (const resource of resources) {
        if (!resource.ResourceARN) continue;
        const environment = resource.Tags?.find((tag) => tag.Key === "Environment")?.Value;
        if (environment && envFilter(environment)) {
          result.push({ arn: resource.ResourceARN, environment });
        }
      }
      logger.debug(`Fetched ${count} resources, ${result.length} from closed PRs`);
    }
    PaginationToken = response.PaginationToken;
    if (!PaginationToken) break;
  }
  // TODO: get IAM roles
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
  for (const [type, count] of typeCounts.entries()) {
    logger.info(`  ${type}: ${count}`);
  }
  logger.info("Environments:");
  for (const [environment, count] of Array.from(environmentCounts.entries()).sort((a, b) =>
    compareNumericString(a[0], b[0])
  )) {
    logger.info(`  ${environment}: ${count}`);
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    return false;
  }
}

try {
  let resources: Resource[];
  if (resourcesJsonFile && (await fileExists(resourcesJsonFile))) {
    logger.info(`Loading resources from ${resourcesJsonFile}`);
    resources = JSON.parse(await readFile(resourcesJsonFile, "utf8"));
  } else {
    if (!GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN not set");
    }
    if (!TERRAFORM_CLOUD_TOKEN) {
      throw new Error("TERRAFORM_CLOUD_TOKEN not set");
    }

    const workspaces = await getTerraformWorkspaces({
      token: TERRAFORM_CLOUD_TOKEN,
      organization: TERRAFORM_CLOUD_ORGANIZATION,
    });
    logger.info(`Workspaces: ${workspaces.map((ws) => ws.name).join(", ")}`);

    const prNumbers = await getPullRequestNumbers({
      token: GITHUB_TOKEN,
      owner: GITHUB_OWNER,
      repository: GITHUB_REPOSITORY,
    });
    logger.info(`Open PRs: ${prNumbers.openPRs.join(", ")}`);
    logger.info(`Last PR: ${prNumbers.lastPR}`);

    const closedPRFilter = getClosedPREnvironmentFilter(prNumbers, workspaces);

    resources = await getEnvironmentResources(closedPRFilter);
    if (resourcesJsonFile) {
      logger.info(`Saving resources to ${resourcesJsonFile}`);
      await writeFile(resourcesJsonFile, JSON.stringify(resources));
    }
  }

  summarizeResources(resources);

  const schedulerBuilder = new SchedulerBuilder(resourceTypeDependencies);
  const unrecognizedResourceTypeArns = new Map<string, string[]>();
  for (const resource of resources) {
    const { arn, environment } = resource;
    // save some envs for end-to-end testing
    if (environment >= "pr-1800") continue;
    const arnFields = parseArn(arn);
    const { service, resourceType: subtype, resourceId } = arnFields;
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
    const { description, dependencyEnumerator, destroyer } = getResourceHandler(resourceType);
    if (dependencyEnumerator) {
      const dependencies = await dependencyEnumerator({ arn, ...arnFields });
      if (dependencies.length) {
        const depList = dependencies.join(", ");
        logger.info(`${environment}: Found dependencies for ${description} ${resourceId}: ${depList}`);
      }
    }
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
            await destroyer({ arn, ...arnFields, poller: pollPredicate });
            logger.info(`${environment}: Destroyed ${description} ${resourceId}`);
          } catch (err) {
            logger.error(`${environment}: Error destroying ${description} ${resourceId}: ${asError(err).message}`);
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
}
