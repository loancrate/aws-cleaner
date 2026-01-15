import {
  DeleteNamespaceCommand,
  DeleteServiceCommand,
  GetNamespaceCommand,
  ServiceDiscoveryClient,
} from "@aws-sdk/client-servicediscovery";
import { ResourceDescriberParams } from "../ResourceDescriber.js";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";
import { getErrorCode } from "../awserror.js";

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
  try {
    const client = getClient();
    const command = new DeleteNamespaceCommand({
      Id: resourceId,
    });
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) !== "NamespaceNotFound") throw err;
  }
}

export async function describeDiscoveryNamespace({
  resourceId,
}: Pick<ResourceDescriberParams, "resourceId">): Promise<string | undefined> {
  try {
    const client = getClient();
    const command = new GetNamespaceCommand({
      Id: resourceId,
    });
    const response = await client.send(command);
    const namespace = response.Namespace;
    if (namespace?.Name) {
      let extra = resourceId;
      const hostedZoneId = namespace?.Properties?.DnsProperties?.HostedZoneId;
      if (hostedZoneId) {
        extra += `, hosted zone ${hostedZoneId}`;
      }
      return `${namespace.Name} (${extra})`;
    }
    return resourceId;
  } catch (err) {
    if (getErrorCode(err) !== "NamespaceNotFound") throw err;
  }
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
