import {
  DeleteClusterCommand,
  DeleteServiceCommand,
  DeregisterTaskDefinitionCommand,
  ECSClient,
} from "@aws-sdk/client-ecs";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

export async function deleteCluster({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  // TODO: wait for tasks to terminate
  // pr-1831: Error destroying ECS Cluster app-cluster-pr-1831: The Cluster cannot be deleted while Tasks are active.
  const client = new ECSClient({});
  const command = new DeleteClusterCommand({ cluster: resourceId });
  await client.send(command);
}

export async function deleteService({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const [cluster, service] = resourceId.split("/", 2);
  const client = new ECSClient({});
  const command = new DeleteServiceCommand({ cluster, service, force: true });
  await client.send(command);
}

export async function deleteTaskDefinition({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new ECSClient({});
  const command = new DeregisterTaskDefinitionCommand({ taskDefinition: resourceId });
  await client.send(command);
}
