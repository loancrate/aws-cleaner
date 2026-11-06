import { GetCallerIdentityCommand, GetCallerIdentityCommandOutput, STSClient } from "@aws-sdk/client-sts";

let client: STSClient | undefined;

function getClient(): STSClient {
  if (!client) {
    client = new STSClient({});
  }
  return client;
}

export interface AwsAccount {
  accountId: string;
  region: string;
}

/** Returns the account and region that resources will be deleted from, per the current credentials. */
export async function getAwsAccount(): Promise<AwsAccount> {
  const { Account } = await getCallerIdentity();
  if (!Account) {
    throw new Error("STS did not return an AWS account ID");
  }
  return { accountId: Account, region: await getClient().config.region() };
}

export async function getCallerIdentity(): Promise<GetCallerIdentityCommandOutput> {
  const client = getClient();
  const command = new GetCallerIdentityCommand({});
  const response = await client.send(command);
  return response;
}
