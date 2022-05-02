import { asError } from "catch-unknown";
import { readFile, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { PullRequestNumbers } from "./github.js";
import logger from "./logger.js";
import { ListRole } from "./resources/iam.js";
import { ResourceTagMappingWithArn } from "./resources/tagging.js";
import { TerraformWorkspace } from "./tfe.js";

const currentVersion = 1;
const filename = "aws-cleaner.json";

const workspacesValidityMs = 15 * 60 * 1000;
const pullRequestsValidityMs = 15 * 60 * 1000;
const resourcesValidityMs = 15 * 60 * 1000;

interface CacheData {
  workspaces?: TerraformWorkspace[];
  workspacesDate?: string;

  pullRequests?: PullRequestNumbers;
  pullRequestsDate?: string;

  taggedResources?: ResourceTagMappingWithArn[];
  taggedResourcesDate?: string;

  roles?: ListRole[];
  rolesDate?: string;
}

interface CacheFile extends CacheData {
  version: number;
}

export class Cache {
  private data: CacheData = {};
  private dirty = false;

  private getPath(): string {
    return path.join(os.tmpdir(), filename);
  }

  public async load(): Promise<void> {
    const path = this.getPath();
    try {
      if (await fileExists(path)) {
        const file = JSON.parse(await readFile(path, "utf8")) as CacheFile;
        if (file.version === currentVersion) {
          logger.debug(`Loaded cache from ${path}`);
          this.data = file;
          this.dirty = false;
          return;
        }
      }
    } catch (err) {
      logger.warn(`Error loading cache from ${path}: ${asError(err).message}`);
    }
    this.data = {};
    this.dirty = false;
  }

  public async save(): Promise<void> {
    if (this.dirty) {
      const file: CacheFile = {
        version: currentVersion,
        ...this.data,
      };
      const path = this.getPath();
      try {
        await writeFile(path, JSON.stringify(file, undefined, 2));
        this.dirty = false;
        logger.debug(`Saved cache to ${path}`);
      } catch (err) {
        logger.warn(`Error saving cache to ${path}: ${asError(err).message}`);
      }
    }
  }

  public getWorkspaces(): TerraformWorkspace[] | undefined {
    const { workspaces, workspacesDate } = this.data;
    if (workspaces && workspacesDate) {
      const date = new Date(workspacesDate);
      if (Date.now() - date.valueOf() <= workspacesValidityMs) {
        logger.debug("Got workspaces from cache");
        return workspaces;
      } else {
        logger.debug(`Cached workspaces expired: ${workspacesDate}`);
      }
    }
  }

  public setWorkspaces(workspaces: TerraformWorkspace[]): void {
    this.data.workspaces = workspaces;
    this.data.workspacesDate = new Date().toISOString();
    this.dirty = true;
  }

  public getPullRequests(): PullRequestNumbers | undefined {
    const { pullRequests, pullRequestsDate } = this.data;
    if (pullRequests && pullRequestsDate) {
      const date = new Date(pullRequestsDate);
      if (Date.now() - date.valueOf() <= pullRequestsValidityMs) {
        logger.debug("Got pull requests from cache");
        return pullRequests;
      } else {
        logger.debug(`Cached pull requests expired: ${pullRequestsDate}`);
      }
    }
  }

  public setPullRequests(pullRequests: PullRequestNumbers): void {
    this.data.pullRequests = pullRequests;
    this.data.pullRequestsDate = new Date().toISOString();
    this.dirty = true;
  }

  public getTaggedResources(): ResourceTagMappingWithArn[] | undefined {
    const { taggedResources, taggedResourcesDate } = this.data;
    if (taggedResources && taggedResourcesDate) {
      const date = new Date(taggedResourcesDate);
      if (Date.now() - date.valueOf() <= resourcesValidityMs) {
        logger.debug("Got resources from cache");
        return taggedResources;
      } else {
        logger.debug(`Cached resources expired: ${taggedResourcesDate}`);
      }
    }
  }

  public setTaggedResources(taggedResources: ResourceTagMappingWithArn[]): void {
    this.data.taggedResources = taggedResources;
    this.data.taggedResourcesDate = new Date().toISOString();
    this.dirty = true;
  }

  public deleteTaggedResource(arn: string): void {
    const index = this.data.taggedResources?.findIndex((r) => r.ResourceARN === arn) ?? -1;
    if (index >= 0) {
      this.data.taggedResources?.splice(index, 1);
      this.dirty = true;
    }
  }

  public getRoles(): ListRole[] | undefined {
    const { roles, rolesDate } = this.data;
    if (roles && rolesDate) {
      const date = new Date(rolesDate);
      if (Date.now() - date.valueOf() <= resourcesValidityMs) {
        logger.debug("Got roles from cache");
        return roles;
      } else {
        logger.debug(`Cached roles expired: ${rolesDate}`);
      }
    }
  }

  public setRoles(roles: ListRole[]): void {
    this.data.roles = roles;
    this.data.rolesDate = new Date().toISOString();
    this.dirty = true;
  }

  public deleteRole(arn: string): void {
    const index = this.data.roles?.findIndex((r) => r.Arn === arn) ?? -1;
    if (index >= 0) {
      this.data.roles?.splice(index, 1);
      this.dirty = true;
    }
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
