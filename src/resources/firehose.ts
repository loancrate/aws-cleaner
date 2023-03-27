import { DeleteDeliveryStreamCommand, FirehoseClient } from "@aws-sdk/client-firehose";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: FirehoseClient | undefined;

function getClient(): FirehoseClient {
  if (!client) {
    client = new FirehoseClient({});
  }
  return client;
}

export async function deleteDeliveryStream({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteDeliveryStreamCommand({
    DeliveryStreamName: resourceId,
    AllowForceDelete: true,
  });
  await client.send(command);
}
