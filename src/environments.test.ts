import { describe, expect, test } from "vitest";
import {
  EnvironmentPatterns,
  getEnvironmentFromName,
  getPRNumberFromEnvironment,
  isWorkspaceForEnvironment,
  makeEnvironmentFilter,
  skipWorkspaceEnvironments,
} from "./environments.js";
import type { TerraformWorkspace } from "./tfe.js";

const patterns: EnvironmentPatterns = {
  protectedEnvironments: [/\b(production|staging)\b/i],
  targetEnvironments: ["sandbox"],
  pullRequestEnvironments: [/\bpr-(\d+)\b/i],
};

const prNumbers = { openPRs: [5], lastPR: 10 };

describe(getEnvironmentFromName, () => {
  test.each([
    ["app-pr-12-role", "pr-12"],
    ["sandbox", "sandbox"],
    ["app-production-role", "production"],
    ["unrelated", undefined],
  ])("%s -> %s", (name, env) => {
    expect(getEnvironmentFromName(name, patterns)).toBe(env);
  });

  test("prefers protected patterns", () => {
    expect(getEnvironmentFromName("staging-pr-12", patterns)).toBe("staging");
  });
});

test(getPRNumberFromEnvironment, () => {
  expect(getPRNumberFromEnvironment("pr-12", patterns)).toBe(12);
  expect(getPRNumberFromEnvironment("sandbox", patterns)).toBeUndefined();
});

describe(makeEnvironmentFilter, () => {
  const filter = makeEnvironmentFilter(patterns, prNumbers);

  test.each([
    ["pr-3", true, "a closed PR"],
    ["pr-10", true, "the last PR, closed"],
    ["pr-5", false, "an open PR"],
    ["pr-11", false, "a PR newer than the last PR seen"],
    ["sandbox", true, "a target environment"],
    ["staging", false, "a protected environment"],
    ["unrelated", false, "an unknown environment"],
  ])("%s -> %s (%s)", (env, expected) => {
    expect(filter(env)).toBe(expected);
  });

  test("protection wins over target and PR patterns", () => {
    const filter = makeEnvironmentFilter({ ...patterns, targetEnvironments: ["staging"] }, prNumbers);
    expect(filter("staging")).toBe(false);
    expect(filter("staging pr-3")).toBe(false);
  });

  test("keeps PR environments when PR numbers are unknown", () => {
    const filter = makeEnvironmentFilter(patterns, undefined);
    expect(filter("pr-3")).toBe(false);
    expect(filter("sandbox")).toBe(true);
  });
});

describe(isWorkspaceForEnvironment, () => {
  test.each([
    ["app-pr-12", "pr-12", true],
    ["pr-12", "pr-12", true],
    ["pr-12-infra", "pr-12", true],
    ["app-sandbox", "sandbox", true],
    ["App-PR-12", "pr-12", true],
    ["app-pr-123", "pr-12", false],
    ["app-pr-1", "pr-12", false],
    ["sandbox2", "sandbox", false],
    ["app-a.b", "a.b", true],
    ["app-axb", "a.b", false],
  ])("%s, %s -> %s", (workspaceName, env, expected) => {
    expect(isWorkspaceForEnvironment(workspaceName, env)).toBe(expected);
  });
});

describe(skipWorkspaceEnvironments, () => {
  const workspaces = [{ name: "app-pr-3" }] as TerraformWorkspace[];
  const filter = skipWorkspaceEnvironments(makeEnvironmentFilter(patterns, prNumbers), workspaces);

  test("skips environments with a remaining workspace", () => {
    expect(filter("pr-3")).toBe(false);
    expect(filter("pr-4")).toBe(true);
  });

  test("does not skip an environment whose name prefixes another workspace's", () => {
    const filter = skipWorkspaceEnvironments(() => true, [{ name: "app-pr-123" }] as TerraformWorkspace[]);
    expect(filter("pr-12")).toBe(true);
  });

  test("skips nothing without workspaces", () => {
    expect(skipWorkspaceEnvironments(() => true, undefined)("pr-3")).toBe(true);
  });
});
