import { DeleteEventSourceMappingCommand, DeleteFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";
import { getErrorCode } from "../awserror.js";

let client: LambdaClient | undefined;

function getClient(): LambdaClient {
  if (!client) {
    client = new LambdaClient({});
  }
  return client;
}

export async function deleteLambdaFunction({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteFunctionCommand({ FunctionName: resourceId });
  try {
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) === "ResourceNotFoundException") {
      return;
    }
    throw err;
  }
}

export async function deleteEventSourceMapping({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteEventSourceMappingCommand({ UUID: resourceId });
  try {
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) === "ResourceNotFoundException") {
      return;
    }
    throw err;
  }
}
