import { KMSClient, ListAliasesCommand, ScheduleKeyDeletionCommand } from "@aws-sdk/client-kms";
import { ResourceDescriberParams } from "../ResourceDescriber.js";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";
import { getErrorCode } from "../awserror.js";

let client: KMSClient | undefined;

function getClient(): KMSClient {
  if (!client) {
    client = new KMSClient({});
  }
  return client;
}

export async function deleteKmsKey({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  try {
    const client = getClient();
    const command = new ScheduleKeyDeletionCommand({
      KeyId: resourceId,
      PendingWindowInDays: 7,
    });
    await client.send(command);
  } catch (err) {
    // Ignore keys pending deletion
    if (getErrorCode(err) !== "KMSInvalidStateException") throw err;
  }
}

export async function describeKmsKey({ resourceId }: Pick<ResourceDescriberParams, "resourceId">): Promise<string> {
  const client = getClient();
  const command = new ListAliasesCommand({ KeyId: resourceId });
  const response = await client.send(command);
  const alias = response.Aliases?.[0];
  return alias?.AliasName ? `${alias.AliasName} (${resourceId})` : resourceId;
}
