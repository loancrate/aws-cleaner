import { CloudWatchLogsClient, DeleteLogGroupCommand } from "@aws-sdk/client-cloudwatch-logs";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: CloudWatchLogsClient | undefined;

function getClient(): CloudWatchLogsClient {
  if (!client) {
    client = new CloudWatchLogsClient({});
  }
  return client;
}

export async function deleteLogGroup({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteLogGroupCommand({ logGroupName: resourceId });
  await client.send(command);
}
