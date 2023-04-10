import { DeleteTopicCommand, SNSClient } from "@aws-sdk/client-sns";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: SNSClient | undefined;

function getClient(): SNSClient {
  if (!client) {
    client = new SNSClient({});
  }
  return client;
}

export async function deleteSnsTopic({ arn }: Pick<ResourceDestroyerParams, "arn">): Promise<void> {
  const client = getClient();
  const command = new DeleteTopicCommand({
    TopicArn: arn,
  });
  await client.send(command);
}
