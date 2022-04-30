import {
  DeleteGroupCommand,
  DeleteInstanceProfileCommand,
  DeletePolicyCommand,
  DeleteRoleCommand,
  DeleteUserCommand,
  IAMClient,
} from "@aws-sdk/client-iam";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

export async function deleteGroup({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new IAMClient({});
  const command = new DeleteGroupCommand({ GroupName: resourceId });
  await client.send(command);
}

export async function deleteInstanceProfile({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  // TODO: remove roles
  // pr-1705: Error destroying IAM Instance Profile app-ec2-script-pr-1705: Cannot delete entity, must remove roles from instance profile first.
  const client = new IAMClient({});
  const command = new DeleteInstanceProfileCommand({ InstanceProfileName: resourceId });
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
