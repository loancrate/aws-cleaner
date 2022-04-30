import { CloudWatchLogsClient, DeleteLogGroupCommand } from "@aws-sdk/client-cloudwatch-logs";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

export async function deleteLogGroup({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new CloudWatchLogsClient({});
  const command = new DeleteLogGroupCommand({ logGroupName: resourceId });
  await client.send(command);
}
