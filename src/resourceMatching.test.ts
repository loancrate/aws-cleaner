import { describe, expect, test, vi } from "vitest";
import { makeEnvironmentFilter } from "./environments.js";
import type { ListRole } from "./resources/iam.js";
import {
  getTagEnvironment,
  MatchContext,
  matchInstances,
  matchRoles,
  matchTaggedResources,
  matchTaskDefinitionFamilies,
} from "./resourceMatching.js";

const config = {
  awsEnvironmentTags: [/^env(ironment)?$/i],
  protectedEnvironments: [/\bproduction\b/i],
  targetEnvironments: [],
  pullRequestEnvironments: [/\bpr-(\d+)\b/i],
};
const ctx: MatchContext = {
  config,
  filter: makeEnvironmentFilter(config, { openPRs: [5], lastPR: 10 }),
  accountId: "123456789012",
};

const envTag = (value: string) => [{ Key: "Environment", Value: value }];
const role = (name: string): ListRole => ({
  Arn: `arn:aws:iam::123456789012:role/${name}`,
  RoleName: name,
  Path: "/",
  RoleId: name,
  CreateDate: new Date(0),
});

test(getTagEnvironment, () => {
  expect(getTagEnvironment([{ Key: "Name", Value: "x" }, ...envTag("pr-3")], config.awsEnvironmentTags)).toBe("pr-3");
  expect(getTagEnvironment([{ Key: "Name", Value: "pr-3" }], config.awsEnvironmentTags)).toBeUndefined();
  expect(getTagEnvironment(undefined, config.awsEnvironmentTags)).toBeUndefined();
});

describe(matchTaggedResources, () => {
  test("matches resources whose environment tag passes the filter", () => {
    const resources = [
      { ResourceARN: "arn:aws:ec2:us-east-1:123456789012:vpc/vpc-1", Tags: envTag("pr-3") },
      { ResourceARN: "arn:aws:ec2:us-east-1:123456789012:vpc/vpc-2", Tags: envTag("pr-5") },
      { ResourceARN: "arn:aws:ec2:us-east-1:123456789012:vpc/vpc-3", Tags: envTag("production") },
      { ResourceARN: "arn:aws:ec2:us-east-1:123456789012:vpc/vpc-4" },
    ];
    expect(matchTaggedResources(resources, ctx)).toMatchObject([
      {
        arn: "arn:aws:ec2:us-east-1:123456789012:vpc/vpc-1",
        arnFields: { resourceType: "vpc", resourceId: "vpc-1" },
        environment: "pr-3",
      },
    ]);
  });

  test("matches task definitions by family", () => {
    const resources = [
      { ResourceARN: "arn:aws:ecs:us-east-1:123456789012:task-definition/app-pr-3:7", Tags: envTag("pr-3") },
    ];
    expect(matchTaggedResources(resources, ctx).map((r) => r.arn)).toEqual([
      "arn:aws:ecs::123456789012:task-definition-family:app-pr-3",
    ]);
  });
});

describe(matchRoles, () => {
  test("matches roles by name, then by tag, and skips AWS roles", async () => {
    const tags: Record<string, { Key: string; Value: string }[]> = { "untagged-name": envTag("pr-4") };
    const getRoleTags = vi.fn((r: ListRole) => Promise.resolve(tags[r.RoleName] ?? []));
    const roles = [role("app-pr-3"), role("untagged-name"), role("app-pr-5"), role("AWSServiceRole-pr-3"), role("x")];

    const matched = await matchRoles(roles, getRoleTags, ctx);

    expect(matched.map((r) => [r.arnFields.resourceId, r.environment])).toEqual([
      ["app-pr-3", "pr-3"],
      ["untagged-name", "pr-4"],
    ]);
    expect(getRoleTags.mock.calls.map(([r]) => r.RoleName)).toEqual(["untagged-name", "x"]);
  });
});

describe(matchTaskDefinitionFamilies, () => {
  const families = ["app-pr-3", "app-pr-5", "app-production", "unnamed"];

  test("matches families named for environments that pass the filter", () => {
    expect(matchTaskDefinitionFamilies(families, ctx)).toMatchObject([
      {
        arn: "arn:aws:ecs::123456789012:task-definition-family:app-pr-3",
        arnFields: { resourceId: "app-pr-3" },
        environment: "pr-3",
      },
    ]);
  });

  test("includes families with no environment in their names when asked", () => {
    const matched = matchTaskDefinitionFamilies(families, ctx, { includeUnnamed: true });
    expect(matched.map((r) => [r.arnFields.resourceId, r.environment])).toEqual([
      ["app-pr-3", "pr-3"],
      ["unnamed", "<none>"],
    ]);
  });
});

test(matchInstances, () => {
  const instances = [
    { instanceId: "i-1", name: "app-pr-3", region: "us-west-2" },
    { instanceId: "i-2", name: "app-pr-5", region: "us-west-2" },
    { instanceId: "i-3", region: "us-west-2" },
  ];
  expect(matchInstances(instances, ctx)).toMatchObject([
    {
      arn: "arn:aws:ec2:us-west-2:123456789012:instance/i-1",
      arnFields: { resourceType: "instance", resourceId: "i-1" },
      environment: "pr-3",
    },
  ]);
});
