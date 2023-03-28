import {
  AttachedPolicy,
  DeleteGroupCommand,
  DeleteInstanceProfileCommand,
  DeletePolicyCommand,
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  DeleteUserCommand,
  DetachRolePolicyCommand,
  GetInstanceProfileCommand,
  IAMClient,
  InstanceProfile,
  ListAttachedRolePoliciesCommand,
  ListRolePoliciesCommand,
  ListRolesCommand,
  ListRoleTagsCommand,
  RemoveRoleFromInstanceProfileCommand,
  Role,
  Tag,
} from "@aws-sdk/client-iam";
import { setTimeout } from "timers/promises";
import { getErrorCode } from "../awserror.js";
import logger from "../logger.js";
import { RateLimiter } from "../RateLimiter.js";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: IAMClient | undefined;

function getClient(): IAMClient {
  if (!client) {
    client = new IAMClient({});
  }
  return client;
}

const rateLimiter = new RateLimiter({ windowMs: 100 });

async function throttle<T>(task: () => Promise<T>): Promise<T> {
  let backOffMs = 1000;
  for (;;) {
    await rateLimiter.wait();
    try {
      return await task();
    } catch (err) {
      if (getErrorCode(err) !== "Throttling") throw err;
      rateLimiter.empty();
      logger.debug(`IAM API throttled, waiting ${backOffMs} ms`);
      await setTimeout(backOffMs);
      backOffMs *= 2;
    }
  }
}

export async function deleteGroup({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteGroupCommand({ GroupName: resourceId });
  await throttle(() => client.send(command));
}

export async function deleteInstanceProfile({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const profile = await getInstanceProfile(resourceId);
  if (profile) {
    if (profile.Roles) {
      for (const role of profile.Roles) {
        if (role.RoleName) {
          logger.debug(`Removing role ${role.RoleName} from instance profile ${resourceId}`);
          await removeRoleFromInstanceProfile(resourceId, role.RoleName);
        }
      }
    }

    const client = getClient();
    const command = new DeleteInstanceProfileCommand({ InstanceProfileName: resourceId });
    await throttle(() => client.send(command));
  }
}

async function getInstanceProfile(InstanceProfileName: string): Promise<InstanceProfile | undefined> {
  const client = getClient();
  const command = new GetInstanceProfileCommand({ InstanceProfileName });
  try {
    const response = await throttle(() => client.send(command));
    return response.InstanceProfile;
  } catch (err) {
    if (getErrorCode(err) !== "NoSuchEntity") throw err;
  }
}

async function removeRoleFromInstanceProfile(InstanceProfileName: string, RoleName: string): Promise<void> {
  const client = getClient();
  const command = new RemoveRoleFromInstanceProfileCommand({ InstanceProfileName, RoleName });
  await throttle(() => client.send(command));
}

export async function deletePolicy({ arn }: Pick<ResourceDestroyerParams, "arn">): Promise<void> {
  const client = getClient();
  const command = new DeletePolicyCommand({ PolicyArn: arn });
  await throttle(() => client.send(command));
}

export async function deleteRole({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const attachedPolicies = await listAttachedRolePolicies(resourceId);
  for (const policy of attachedPolicies) {
    if (policy.PolicyArn) {
      logger.debug(`Detaching policy from role ${resourceId}: ${policy.PolicyName || policy.PolicyArn}`);
      await detachRolePolicy(resourceId, policy.PolicyArn);
    }
  }

  const inlinePolicies = await listRolePolicies(resourceId);
  for (const policy of inlinePolicies) {
    logger.debug(`Deleting policy from role ${resourceId}: ${policy}`);
    await deleteRolePolicy(resourceId, policy);
  }

  const client = getClient();
  const command = new DeleteRoleCommand({ RoleName: resourceId });
  await throttle(() => client.send(command));
}

async function listAttachedRolePolicies(RoleName: string): Promise<AttachedPolicy[]> {
  const client = getClient();
  const command = new ListAttachedRolePoliciesCommand({ RoleName });
  const response = await throttle(() => client.send(command));
  return response.AttachedPolicies || [];
}

async function detachRolePolicy(RoleName: string, PolicyArn: string): Promise<void> {
  const client = getClient();
  const command = new DetachRolePolicyCommand({ RoleName, PolicyArn });
  await throttle(() => client.send(command));
}

async function listRolePolicies(RoleName: string): Promise<string[]> {
  const client = getClient();
  const command = new ListRolePoliciesCommand({ RoleName });
  const response = await throttle(() => client.send(command));
  return response.PolicyNames || [];
}

async function deleteRolePolicy(RoleName: string, PolicyName: string): Promise<void> {
  const client = getClient();
  const command = new DeleteRolePolicyCommand({ RoleName, PolicyName });
  await throttle(() => client.send(command));
}

export type ListRole = Omit<Role, "Tags"> & { Arn: string; RoleName: string };

export async function listRoles(): Promise<ListRole[]> {
  const result: ListRole[] = [];
  const client = getClient();
  for (let Marker: string | undefined, count = 0; ; ) {
    const command = new ListRolesCommand({ Marker, MaxItems: 100 });
    const response = await throttle(() => client.send(command));
    const roles = response.Roles;
    if (roles) {
      count += roles.length;
      for (const role of roles) {
        if (!role.Arn || !role.RoleName) continue;
        result.push(role as ListRole);
      }
      logger.debug(`Fetched ${count} roles`);
    }
    Marker = response.Marker;
    if (!Marker) break;
  }
  return result;
}

export async function listRoleTags(RoleName: string): Promise<Tag[]> {
  const iamClient = getClient();
  const command = new ListRoleTagsCommand({ RoleName });
  const response = await iamClient.send(command);
  return response.Tags || [];
}

export async function deleteUser({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteUserCommand({ UserName: resourceId });
  await throttle(() => client.send(command));
}
