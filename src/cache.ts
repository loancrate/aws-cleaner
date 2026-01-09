import { Tag } from "@aws-sdk/client-iam";
import { asError } from "catch-unknown";
import { readFile, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { PullRequestNumbers } from "./github.js";
import logger from "./logger.js";
import { InstanceInfo } from "./resources/ec2.js";
import { ListRole } from "./resources/iam.js";
import { ResourceTagMappingWithArn } from "./resources/tagging.js";
import { TerraformWorkspace } from "./tfe.js";

const currentVersion = 1;
const filename = "aws-cleaner.json";

interface RoleTags {
  tags: Tag[];
  date: string;
}

interface CacheData {
  workspaces?: TerraformWorkspace[];
  workspacesDate?: string;

  pullRequests?: PullRequestNumbers;
  pullRequestsDate?: string;

  taggedResources?: ResourceTagMappingWithArn[];
  taggedResourcesDate?: string;

  roles?: ListRole[];
  rolesDate?: string;

  roleTags?: Record<string, RoleTags>;

  activeTaskDefinitionFamilies?: string[];
  activeTaskDefinitionFamiliesDate?: string;

  inactiveTaskDefinitionFamilies?: string[];
  inactiveTaskDefinitionFamiliesDate?: string;

  instances?: InstanceInfo[];
  instancesDate?: string;
}

interface CacheFile extends CacheData {
  version: number;
}

export interface CacheConfiguration {
  disabled: boolean;
  workspacesTtlMs: number;
  pullRequestsTtlMs: number;
  resourcesTtlMs: number;
  roleTagsTtlMs: number;
}

export class Cache {
  private data: CacheData = {};
  private dirty = false;

  public constructor(private readonly config: CacheConfiguration) {}

  private getPath(): string {
    return path.join(os.tmpdir(), filename);
  }

  public async load(): Promise<void> {
    if (!this.config.disabled) {
      const path = this.getPath();
      try {
        if (await fileExists(path)) {
          const file = JSON.parse(await readFile(path, "utf8")) as CacheFile;
          if (file.version === currentVersion) {
            logger.info(`Loaded cache from ${path}`);
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
  }

  public async save(): Promise<void> {
    if (this.config.disabled) {
      return;
    }

    // Invalidate cache entries that have expired
    this.getWorkspaces();
    this.getPullRequests();
    this.getTaggedResources();
    this.getRoles();
    this.deleteExpiredRoleTags();
    this.getActiveTaskDefinitionFamilies();
    this.getInactiveTaskDefinitionFamilies();
    this.getInstances();

    if (!this.dirty) {
      return;
    }

    const file: CacheFile = {
      version: currentVersion,
      ...this.data,
    };

    const path = this.getPath();
    try {
      await writeFile(path, JSON.stringify(file, undefined, 2));
      this.dirty = false;
      logger.info(`Saved cache to ${path}`);
    } catch (err) {
      logger.warn(`Error saving cache to ${path}: ${asError(err).message}`);
    }
  }

  public getWorkspaces(): TerraformWorkspace[] | undefined {
    const { workspaces, workspacesDate } = this.data;
    if (workspaces && workspacesDate) {
      if (isValid(workspacesDate, this.config.workspacesTtlMs)) {
        logger.debug("Got workspaces from cache");
        return workspaces;
      } else {
        logger.debug(`Cached workspaces expired: ${workspacesDate}`);
        delete this.data.workspaces;
        delete this.data.workspacesDate;
        this.dirty = true;
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
      if (isValid(pullRequestsDate, this.config.pullRequestsTtlMs)) {
        logger.debug("Got pull requests from cache");
        return pullRequests;
      } else {
        logger.debug(`Cached pull requests expired: ${pullRequestsDate}`);
        delete this.data.pullRequests;
        delete this.data.pullRequestsDate;
        this.dirty = true;
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
      if (isValid(taggedResourcesDate, this.config.resourcesTtlMs)) {
        logger.debug("Got resources from cache");
        return taggedResources;
      } else {
        logger.debug(`Cached resources expired: ${taggedResourcesDate}`);
        delete this.data.taggedResources;
        delete this.data.taggedResourcesDate;
        this.dirty = true;
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
      if (isValid(rolesDate, this.config.resourcesTtlMs)) {
        logger.debug("Got roles from cache");
        return roles;
      } else {
        logger.debug(`Cached roles expired: ${rolesDate}`);
        delete this.data.roles;
        delete this.data.rolesDate;
        this.dirty = true;
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
    if (this.data.roleTags && arn in this.data.roleTags) {
      delete this.data.roleTags[arn];
      this.dirty = true;
    }
  }

  public getRoleTags(arn: string): Tag[] | undefined {
    const { roleTags } = this.data;
    const entry = roleTags?.[arn];
    if (entry) {
      if (isValid(entry.date, this.config.roleTagsTtlMs)) {
        logger.debug(`Got tags for role ${arn} from cache`);
        return entry.tags;
      } else {
        logger.debug(`Cached tags for role ${arn} expired: ${entry.date}`);
        delete roleTags[arn];
        this.dirty = true;
      }
    }
  }

  public setRoleTags(arn: string, tags: Tag[]): void {
    if (!this.data.roleTags) {
      this.data.roleTags = {};
    }
    this.data.roleTags[arn] = { tags, date: new Date().toDateString() };
    this.dirty = true;
  }

  public deleteExpiredRoleTags(): void {
    const { roleTags } = this.data;
    if (roleTags) {
      for (const [arn, entry] of Object.entries(roleTags)) {
        if (!isValid(entry.date, this.config.roleTagsTtlMs)) {
          delete roleTags[arn];
          this.dirty = true;
        }
      }
    }
  }

  public getActiveTaskDefinitionFamilies(): string[] | undefined {
    const { activeTaskDefinitionFamilies, activeTaskDefinitionFamiliesDate } = this.data;
    if (activeTaskDefinitionFamilies && activeTaskDefinitionFamiliesDate) {
      if (isValid(activeTaskDefinitionFamiliesDate, this.config.resourcesTtlMs)) {
        logger.debug("Got active task definition families from cache");
        return activeTaskDefinitionFamilies;
      } else {
        logger.debug(`Cached active task definition families expired: ${activeTaskDefinitionFamiliesDate}`);
        delete this.data.activeTaskDefinitionFamilies;
        delete this.data.activeTaskDefinitionFamiliesDate;
        this.dirty = true;
      }
    }
  }

  public setActiveTaskDefinitionFamilies(families: string[]): void {
    this.data.activeTaskDefinitionFamilies = families;
    this.data.activeTaskDefinitionFamiliesDate = new Date().toISOString();
    this.dirty = true;
  }

  public deleteActiveTaskDefinitionFamily(family: string): void {
    const index = this.data.activeTaskDefinitionFamilies?.findIndex((f) => f === family) ?? -1;
    if (index >= 0) {
      this.data.activeTaskDefinitionFamilies?.splice(index, 1);
      this.dirty = true;
    }
  }

  public getInactiveTaskDefinitionFamilies(): string[] | undefined {
    const { inactiveTaskDefinitionFamilies, inactiveTaskDefinitionFamiliesDate } = this.data;
    if (inactiveTaskDefinitionFamilies && inactiveTaskDefinitionFamiliesDate) {
      if (isValid(inactiveTaskDefinitionFamiliesDate, this.config.resourcesTtlMs)) {
        logger.debug("Got inactive task definition families from cache");
        return inactiveTaskDefinitionFamilies;
      } else {
        logger.debug(`Cached inactive task definition families expired: ${inactiveTaskDefinitionFamiliesDate}`);
        delete this.data.inactiveTaskDefinitionFamilies;
        delete this.data.inactiveTaskDefinitionFamiliesDate;
        this.dirty = true;
      }
    }
  }

  public setInactiveTaskDefinitionFamilies(families: string[]): void {
    this.data.inactiveTaskDefinitionFamilies = families;
    this.data.inactiveTaskDefinitionFamiliesDate = new Date().toISOString();
    this.dirty = true;
  }

  public deleteInactiveTaskDefinitionFamily(family: string): void {
    const index = this.data.inactiveTaskDefinitionFamilies?.findIndex((f) => f === family) ?? -1;
    if (index >= 0) {
      this.data.inactiveTaskDefinitionFamilies?.splice(index, 1);
      this.dirty = true;
    }
  }

  public getInstances(): InstanceInfo[] | undefined {
    const { instances, instancesDate } = this.data;
    if (instances && instancesDate) {
      if (isValid(instancesDate, this.config.resourcesTtlMs)) {
        logger.debug("Got EC2 instances from cache");
        return instances;
      } else {
        logger.debug(`Cached EC2 instances expired: ${instancesDate}`);
        delete this.data.instances;
        delete this.data.instancesDate;
        this.dirty = true;
      }
    }
  }

  public setInstances(instances: InstanceInfo[]): void {
    this.data.instances = instances;
    this.data.instancesDate = new Date().toISOString();
    this.dirty = true;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function isValid(dateString: string, validityMs: number): boolean {
  return Date.now() - new Date(dateString).valueOf() <= validityMs;
}
