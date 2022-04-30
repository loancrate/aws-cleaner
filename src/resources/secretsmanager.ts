import { DeleteSecretCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

export async function deleteSecret({ arn }: Pick<ResourceDestroyerParams, "arn">): Promise<void> {
  const client = new SecretsManagerClient({});
  const command = new DeleteSecretCommand({
    SecretId: arn,
    ForceDeleteWithoutRecovery: true,
  });
  await client.send(command);
}
