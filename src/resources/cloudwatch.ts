import { CloudWatchClient, DeleteAlarmsCommand } from "@aws-sdk/client-cloudwatch";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: CloudWatchClient | undefined;

function getClient(): CloudWatchClient {
  if (!client) {
    client = new CloudWatchClient({});
  }
  return client;
}

export async function deleteCloudWatchAlarm({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteAlarmsCommand({
    AlarmNames: [resourceId],
  });
  await client.send(command);
}
