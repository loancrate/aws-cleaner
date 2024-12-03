import { DeletePlaceIndexCommand, LocationClient } from "@aws-sdk/client-location";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: LocationClient | undefined;

function getClient(): LocationClient {
  if (!client) {
    client = new LocationClient({});
  }
  return client;
}

export async function deleteLocationPlaceIndex({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeletePlaceIndexCommand({ IndexName: resourceId });
  await client.send(command);
}
