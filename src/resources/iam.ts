import {
  DeleteGroupCommand,
  DeleteInstanceProfileCommand,
  DeletePolicyCommand,
  DeleteRoleCommand,
  DeleteUserCommand,
  GetInstanceProfileCommand,
  IAMClient,
  InstanceProfile,
  RemoveRoleFromInstanceProfileCommand,
} from "@aws-sdk/client-iam";
import logger from "../logger.js";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

export async function deleteGroup({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new IAMClient({});
  const command = new DeleteGroupCommand({ GroupName: resourceId });
  await client.send(command);
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

    const client = new IAMClient({});
    const command = new DeleteInstanceProfileCommand({ InstanceProfileName: resourceId });
    await client.send(command);
  }
}

async function getInstanceProfile(InstanceProfileName: string): Promise<InstanceProfile | undefined> {
  const client = new IAMClient({});
  const command = new GetInstanceProfileCommand({ InstanceProfileName });
  const response = await client.send(command);
  return response.InstanceProfile;
}

async function removeRoleFromInstanceProfile(InstanceProfileName: string, RoleName: string): Promise<void> {
  const client = new IAMClient({});
  const command = new RemoveRoleFromInstanceProfileCommand({ InstanceProfileName, RoleName });
  await client.send(command);
}

export async function deletePolicy({ arn }: Pick<ResourceDestroyerParams, "arn">): Promise<void> {
  const client = new IAMClient({});
  const command = new DeletePolicyCommand({ PolicyArn: arn });
  await client.send(command);
}

export async function deleteRole({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new IAMClient({});
  const command = new DeleteRoleCommand({ RoleName: resourceId });
  await client.send(command);
}

export async function deleteUser({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new IAMClient({});
  const command = new DeleteUserCommand({ UserName: resourceId });
  await client.send(command);
}
