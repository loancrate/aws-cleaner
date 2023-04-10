import { DeleteClusterCommand, KafkaClient } from "@aws-sdk/client-kafka";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: KafkaClient | undefined;

function getClient(): KafkaClient {
  if (!client) {
    client = new KafkaClient({});
  }
  return client;
}

export async function deleteKafkaCluster({ arn }: Pick<ResourceDestroyerParams, "arn">): Promise<void> {
  const client = getClient();
  const command = new DeleteClusterCommand({
    ClusterArn: arn,
  });
  await client.send(command);
}
