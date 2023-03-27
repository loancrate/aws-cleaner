import { DeleteNamespaceCommand, DeleteServiceCommand, ServiceDiscoveryClient } from "@aws-sdk/client-servicediscovery";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: ServiceDiscoveryClient | undefined;

function getClient(): ServiceDiscoveryClient {
  if (!client) {
    client = new ServiceDiscoveryClient({});
  }
  return client;
}

export async function deleteDiscoveryNamespace({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteNamespaceCommand({
    Id: resourceId,
  });
  await client.send(command);
}

export async function deleteDiscoveryService({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteServiceCommand({
    Id: resourceId,
  });
  await client.send(command);
}
