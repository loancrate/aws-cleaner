import {
  DeleteClusterCommand,
  DeleteServiceCommand,
  DeregisterTaskDefinitionCommand,
  ECSClient,
} from "@aws-sdk/client-ecs";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

export async function deleteCluster({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new ECSClient({});
  const command = new DeleteClusterCommand({ cluster: resourceId });
  await client.send(command);
}

export async function deleteService({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new ECSClient({});
  const command = new DeleteServiceCommand({ service: resourceId });
  await client.send(command);
}

export async function deleteTaskDefinition({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new ECSClient({});
  const command = new DeregisterTaskDefinitionCommand({ taskDefinition: resourceId });
  await client.send(command);
}
