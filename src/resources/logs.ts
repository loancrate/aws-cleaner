import { CloudWatchLogsClient, DeleteLogGroupCommand } from "@aws-sdk/client-cloudwatch-logs";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";
import { getErrorCode } from "../awserror.js";

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
  try {
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) === "ResourceNotFoundException") {
      return;
    }
    throw err;
  }
}
