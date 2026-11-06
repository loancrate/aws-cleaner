import { ArnFields, makeArn, makeTaskDefFamilyArnFields, parseArn } from "./arn.js";
import type { Configuration } from "./config.js";
import { EnvironmentFilter, getEnvironmentFromName } from "./environments.js";
import { matchPatterns } from "./matchPatterns.js";
import type { InstanceInfo } from "./resources/ec2.js";
import type { ListRole } from "./resources/iam.js";
import type { ResourceTagMappingWithArn } from "./resources/tagging.js";

export interface Resource {
  arn: string;
  arnFields: ArnFields;
  environment: string;
}

export interface MatchContext {
  config: Pick<
    Configuration,
    "awsEnvironmentTags" | "protectedEnvironments" | "targetEnvironments" | "pullRequestEnvironments"
  >;
  filter: EnvironmentFilter;
  accountId: string;
}

interface Tag {
  Key?: string;
  Value?: string;
}

/** Returns the value of the first tag whose key is an environment tag. */
export function getTagEnvironment(
  tags: Tag[] | undefined,
  awsEnvironmentTags: (string | RegExp)[],
): string | undefined {
  return tags?.find((tag) => matchPatterns(tag.Key, awsEnvironmentTags))?.Value;
}

/**
 * Matches resources by environment tag. ECS task definitions are matched by family, so that all revisions
 * are deleted together.
 */
export function matchTaggedResources(
  resources: ResourceTagMappingWithArn[],
  { config, filter }: MatchContext,
): Resource[] {
  const result: Resource[] = [];
  for (const resource of resources) {
    const environment = getTagEnvironment(resource.Tags, config.awsEnvironmentTags);
    if (environment && filter(environment)) {
      let arn = resource.ResourceARN;
      let arnFields = parseArn(arn);
      if (arnFields.service === "ecs" && arnFields.resourceType === "task-definition") {
        const family = arnFields.resourceId.split(":")[0];
        arnFields = makeTaskDefFamilyArnFields(arnFields.accountId, family);
        arn = makeArn(arnFields);
      }
      result.push({ arn, arnFields, environment });
    }
  }
  return result;
}

/**
 * Matches IAM roles by name, falling back to their environment tag. Tags are fetched only for roles whose
 * names don't identify an environment. Roles managed by AWS are never matched.
 */
export async function matchRoles(
  roles: ListRole[],
  getRoleTags: (role: ListRole) => Promise<Tag[]>,
  { config, filter }: MatchContext,
): Promise<Resource[]> {
  const result: Resource[] = [];
  for (const role of roles) {
    if (role.RoleName.startsWith("AWS")) {
      continue;
    }
    const environment =
      getEnvironmentFromName(role.RoleName, config) ??
      getTagEnvironment(await getRoleTags(role), config.awsEnvironmentTags);
    if (environment && filter(environment)) {
      result.push({ arn: role.Arn, arnFields: parseArn(role.Arn), environment });
    }
  }
  return result;
}

/**
 * Matches ECS task definition families by name. With `includeUnnamed`, also matches families whose names
 * don't identify any environment, which are assigned the environment "<none>".
 */
export function matchTaskDefinitionFamilies(
  families: string[],
  { config, filter, accountId }: MatchContext,
  { includeUnnamed = false } = {},
): Resource[] {
  const result: Resource[] = [];
  for (const family of families) {
    const environment = getEnvironmentFromName(family, config);
    if (environment != null ? filter(environment) : includeUnnamed) {
      const arnFields = makeTaskDefFamilyArnFields(accountId, family);
      result.push({ arn: makeArn(arnFields), arnFields, environment: environment ?? "<none>" });
    }
  }
  return result;
}

/** Matches EC2 instances by their Name tag. */
export function matchInstances(instances: InstanceInfo[], { config, filter, accountId }: MatchContext): Resource[] {
  const result: Resource[] = [];
  for (const { instanceId, name, region } of instances) {
    const environment = name ? getEnvironmentFromName(name, config) : undefined;
    if (environment && filter(environment)) {
      const arn = `arn:aws:ec2:${region}:${accountId}:instance/${instanceId}`;
      result.push({ arn, arnFields: parseArn(arn), environment });
    }
  }
  return result;
}
