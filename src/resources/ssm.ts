import { DeleteParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";
import { getErrorCode } from "../awserror.js";

let client: SSMClient | undefined;

function getClient(): SSMClient {
  if (!client) {
    client = new SSMClient({});
  }
  return client;
}

export async function deleteParameter({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteParameterCommand({ Name: resourceId });
  try {
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) === "ParameterNotFound") {
      return;
    }
    throw err;
  }
}
