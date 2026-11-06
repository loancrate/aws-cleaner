import { beforeEach, expect, test, vi } from "vitest";
import type { Configuration } from "./config.js";

const readFile = vi.hoisted(() => vi.fn<(path: string) => Promise<string>>());
vi.mock("fs/promises", () => ({ readFile }));
vi.mock("./logger.js", () => ({ default: { warn: vi.fn() } }));

beforeEach(() => {
  vi.resetModules(); // getConfiguration caches its result
  readFile.mockReset();
});

async function load(yaml: string): Promise<Configuration> {
  readFile.mockResolvedValue(yaml);
  const { getConfiguration } = await import("./config.js");
  return getConfiguration();
}

test("applies safe defaults to an empty file", async () => {
  expect(await load("{}")).toEqual({
    dryRun: true,
    continueAfterErrors: false,
    maximumConcurrency: 20,
    ignoreResourceTypes: new Set(),
    deleteInactiveTaskDefinitions: false,
    awsEnvironmentTags: [],
    protectedEnvironments: [],
    pullRequestEnvironments: [],
    targetEnvironments: [],
    github: undefined,
    terraformCloud: undefined,
    cache: {
      disabled: false,
      workspacesTtlMs: 15 * 60_000,
      pullRequestsTtlMs: 15 * 60_000,
      resourcesTtlMs: 15 * 60_000,
      roleTagsTtlMs: 24 * 3_600_000,
    },
  });
});

test("parses /slash-delimited/ strings as regular expressions", async () => {
  const config = await load(`
PROTECTED_ENVIRONMENTS: [production, /^stag/i]
PULL_REQUEST_ENVIRONMENTS: /pr-(\\d+)/
`);
  expect(config.protectedEnvironments).toEqual(["production", /^stag/i]);
  expect(config.pullRequestEnvironments).toEqual([/pr-(\d+)/]);
});

test("enables integrations only when fully configured", async () => {
  const config = await load(`
GITHUB_TOKEN: gh-token
GITHUB_OWNER: owner
TERRAFORM_CLOUD_TOKEN: tf-token
TERRAFORM_CLOUD_ORGANIZATION: org
OVERRIDE_TERRAFORM_VARIABLES:
  - key: region
    value: us-east-1
  - key: AWS_SECRET
    category: env
    sensitive: true
`);
  expect(config.github).toBeUndefined();
  expect(config.terraformCloud).toEqual({
    token: "tf-token",
    organization: "org",
    destroyWorkspaces: false,
    destroyResources: false,
    overrideVariables: [
      { key: "region", value: "us-east-1", category: "terraform", sensitive: false, hcl: false },
      { key: "AWS_SECRET", value: "", category: "env", sensitive: true, hcl: false },
    ],
  });
});

test("falls back to the default duration for an unparseable one", async () => {
  expect((await load("CACHE_RESOURCES_TTL: soon")).cache.resourcesTtlMs).toBe(15 * 60_000);
});

test.each([
  ["DRY_RUN: 'no'", "Boolean value expected for DRY_RUN"],
  ["MAXIMUM_CONCURRENCY: 1.5", "Integer value expected for MAXIMUM_CONCURRENCY"],
  ["IGNORE_RESOURCE_TYPES: [1]", "String array value expected for IGNORE_RESOURCE_TYPES"],
  ["OVERRIDE_TERRAFORM_VARIABLES: [{ value: x }]", "Missing key for OVERRIDE_TERRAFORM_VARIABLES element 0"],
  [
    "OVERRIDE_TERRAFORM_VARIABLES: [{ key: x, category: y }]",
    "Invalid category value for OVERRIDE_TERRAFORM_VARIABLES x",
  ],
])("rejects %s", async (yaml, message) => {
  await expect(load(yaml)).rejects.toThrow(message);
});

test("reads the first configuration file found", async () => {
  readFile.mockImplementation((path) =>
    path === "config/default.yaml" ? Promise.resolve("DRY_RUN: false") : Promise.reject(new Error("ENOENT")),
  );
  const { getConfiguration } = await import("./config.js");
  expect((await getConfiguration()).dryRun).toBe(false);
  expect(readFile.mock.calls.map(([path]) => path)).toEqual([
    "config/local.yaml",
    `config/${process.env.NODE_ENV}.yaml`,
    "config/default.yaml",
  ]);
});
