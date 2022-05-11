import { GetCallerIdentityCommand, GetCallerIdentityCommandOutput, STSClient } from "@aws-sdk/client-sts";

let client: STSClient | undefined;

function getClient(): STSClient {
  if (!client) {
    client = new STSClient({});
  }
  return client;
}

export async function getCallerIdentity(): Promise<GetCallerIdentityCommandOutput> {
  const client = getClient();
  const command = new GetCallerIdentityCommand({});
  const response = await client.send(command);
  return response;
}
