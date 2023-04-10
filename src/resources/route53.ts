import { GetHostedZoneCommand, HostedZone, Route53Client } from "@aws-sdk/client-route-53";

let client: Route53Client | undefined;

function getClient(): Route53Client {
  if (!client) {
    client = new Route53Client({});
  }
  return client;
}

export async function getHostedZone(id: string): Promise<HostedZone | undefined> {
  const client = getClient();
  const command = new GetHostedZoneCommand({ Id: id });
  const response = await client.send(command);
  return response.HostedZone;
}
