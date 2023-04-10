import { DeleteRuleCommand, EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: EventBridgeClient | undefined;

function getClient(): EventBridgeClient {
  if (!client) {
    client = new EventBridgeClient({});
  }
  return client;
}

export async function deleteEventBridgeRule({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteRuleCommand({
    Name: resourceId,
  });
  await client.send(command);
}
