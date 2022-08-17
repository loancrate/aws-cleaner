import assert from "assert";
import { readFile } from "fs/promises";
import jsYaml from "js-yaml";
import parseDuration from "parse-duration";
import { join } from "path";
import { CacheConfiguration } from "./cache.js";
import logger from "./logger.js";
import { isObject } from "./typeUtil.js";

export interface Configuration {
  dryRun: boolean;
  continueAfterErrors: boolean;
  maximumConcurrency: number;
  ignoreResourceTypes: Set<string>;

  awsEnvironmentTags: (string | RegExp)[];
  protectedEnvironments: (string | RegExp)[];
  pullRequestEnvironments: (string | RegExp)[];
  targetEnvironments: (string | RegExp)[];

  github: GithubConfiguration | undefined;

  terraformCloud: TerraformCloudConfiguration | undefined;

  cache: CacheConfiguration;
}

export interface GithubConfiguration {
  token: string;
  owner: string;
  repository: string;
}

export interface TerraformCloudConfiguration {
  token: string;
  organization: string;
  destroyWorkspaces: boolean;
}

let configuration: Configuration | undefined;

export async function getConfiguration(): Promise<Configuration> {
  if (!configuration) {
    const yaml = await readConfiguration();
    const body = jsYaml.load(yaml, {
      onWarning(err) {
        logger.warn(err);
      },
    });
    assert(isObject(body));

    let github: GithubConfiguration | undefined;
    const githubToken = getString(body, "GITHUB_TOKEN");
    const githubOwner = getString(body, "GITHUB_OWNER");
    const githubRepository = getString(body, "GITHUB_REPOSITORY");
    if (githubToken && githubOwner && githubRepository) {
      github = { token: githubToken, owner: githubOwner, repository: githubRepository };
    }

    let terraformCloud: TerraformCloudConfiguration | undefined;
    const terraformCloudToken = getString(body, "TERRAFORM_CLOUD_TOKEN");
    const terraformCloudOrganization = getString(body, "TERRAFORM_CLOUD_ORGANIZATION");
    const destroyTerraformWorkspaces = getBoolean(body, "DESTROY_TERRAFORM_WORKSPACES", false);
    if (terraformCloudToken && terraformCloudOrganization) {
      terraformCloud = {
        token: terraformCloudToken,
        organization: terraformCloudOrganization,
        destroyWorkspaces: destroyTerraformWorkspaces,
      };
    }

    configuration = {
      dryRun: getBoolean(body, "DRY_RUN", true),
      continueAfterErrors: getBoolean(body, "CONTINUE_AFTER_ERRORS", false),
      maximumConcurrency: getInteger(body, "MAXIMUM_CONCURRENCY", 20),
      ignoreResourceTypes: new Set(getStrings(body, "IGNORE_RESOURCE_TYPES")),

      awsEnvironmentTags: getStringsOrRegExps(body, "AWS_ENVIRONMENT_TAGS"),
      protectedEnvironments: getStringsOrRegExps(body, "PROTECTED_ENVIRONMENTS"),
      pullRequestEnvironments: getStringsOrRegExps(body, "PULL_REQUEST_ENVIRONMENTS"),
      targetEnvironments: getStringsOrRegExps(body, "TARGET_ENVIRONMENTS"),

      github,

      terraformCloud,

      cache: {
        disabled: getBoolean(body, "CACHE_DISABLED", false),
        workspacesTtlMs: getDuration(body, "CACHE_WORKSPACES_TTL", "15m"),
        pullRequestsTtlMs: getDuration(body, "CACHE_PULL_REQUESTS_TTL", "15m"),
        resourcesTtlMs: getDuration(body, "CACHE_RESOURCES_TTL", "15m"),
        roleTagsTtlMs: getDuration(body, "CACHE_ROLE_TAGS_TTL", "24h"),
      },
    };
  }
  return configuration;
}

async function readConfiguration(): Promise<string> {
  const { NODE_ENV = "development" } = process.env;
  const envs = ["local", NODE_ENV, "default"];
  const tried = [];
  for (const env of envs) {
    const path = join("config", `${env}.yaml`);
    try {
      return await readFile(path, { encoding: "utf8" });
    } catch {
      //ignored
    }
    tried.push(path);
  }
  throw new Error(`No configuration file found at ${tried.join(", ")}`);
}

function getBoolean(obj: Record<string, unknown>, name: string, def: boolean): boolean {
  const value = obj[name];
  if (value === undefined) {
    return def;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Boolean value expected for ${name}`);
  }
  return value;
}

function getInteger(obj: Record<string, unknown>, name: string, def: number): number {
  const value = obj[name];
  if (value === undefined) {
    return def;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Integer value expected for ${name}`);
  }
  return value;
}

function getString(obj: Record<string, unknown>, name: string, def: string): string;
function getString(obj: Record<string, unknown>, name: string): string | undefined;
function getString(obj: Record<string, unknown>, name: string, def?: string): string | undefined {
  const value = obj[name];
  if (value === undefined) {
    return def;
  }
  if (typeof value !== "string") {
    throw new Error(`String value expected for ${name}`);
  }
  return value;
}

function getStrings(obj: Record<string, unknown>, name: string): string[] {
  const value = obj[name];
  if (value === undefined) {
    return [];
  }
  const array = Array.isArray(value) ? value : [value];
  if (!array.every((e) => typeof e === "string")) {
    throw new Error(`String array value expected for ${name}`);
  }
  return array;
}

function getStringsOrRegExps(obj: Record<string, unknown>, name: string): (string | RegExp)[] {
  return getStrings(obj, name).map((v) => {
    const match = /^\/(.*)\/(i?)$/.exec(v);
    return match ? new RegExp(match[1], match[2]) : v;
  });
}

function getDuration(obj: Record<string, unknown>, name: string, def: string): number {
  return parseDuration(getString(obj, name, def));
}
