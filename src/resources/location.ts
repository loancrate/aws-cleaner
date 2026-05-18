import { DeletePlaceIndexCommand, LocationClient } from "@aws-sdk/client-location";
import { hasErrorCode } from "../awserror.js";
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
  try {
    await client.send(command);
  } catch (err) {
    if (hasErrorCode(err, "ResourceNotFoundException")) {
      return;
    }
    throw err;
  }
}
