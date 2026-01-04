import { DeleteTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";
import { getErrorCode } from "../awserror.js";

let client: DynamoDBClient | undefined;

function getClient(): DynamoDBClient {
  if (!client) {
    client = new DynamoDBClient({});
  }
  return client;
}

export async function deleteTable({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteTableCommand({ TableName: resourceId });
  try {
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) === "ResourceNotFoundException") {
      return;
    }
    throw err;
  }
}
