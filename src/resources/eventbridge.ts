import {
  DeleteRuleCommand,
  EventBridgeClient,
  ListTargetsByRuleCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";
import { hasErrorCode } from "../awserror.js";

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
  try {
    const targetIds = await listTargets(resourceId);
    if (targetIds.length > 0) {
      await removeTargets(resourceId, targetIds);
    }

    const client = getClient();
    const command = new DeleteRuleCommand({
      Name: resourceId,
    });
    await client.send(command);
  } catch (err) {
    if (!hasErrorCode(err, "ResourceNotFoundException")) {
      throw err;
    }
  }
}

async function listTargets(ruleId: string): Promise<string[]> {
  const client = getClient();
  const command = new ListTargetsByRuleCommand({
    Rule: ruleId,
  });
  const response = await client.send(command);
  if (response.Targets) {
    return response.Targets.map((target) => target.Id) as string[];
  }
  return [];
}

async function removeTargets(ruleId: string, targetIds: string[]): Promise<void> {
  const client = getClient();
  const command = new RemoveTargetsCommand({
    Rule: ruleId,
    Ids: targetIds,
  });
  await client.send(command);
}
