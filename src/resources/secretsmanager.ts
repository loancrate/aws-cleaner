import { DeleteSecretCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: SecretsManagerClient | undefined;

function getClient(): SecretsManagerClient {
  if (!client) {
    client = new SecretsManagerClient({});
  }
  return client;
}

export async function deleteSecret({ arn }: Pick<ResourceDestroyerParams, "arn">): Promise<void> {
  const client = getClient();
  const command = new DeleteSecretCommand({
    SecretId: arn,
    ForceDeleteWithoutRecovery: true,
  });
  await client.send(command);
}
