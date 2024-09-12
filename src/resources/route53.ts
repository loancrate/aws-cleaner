import {
  ChangeAction,
  ChangeResourceRecordSetsCommand,
  DeleteHostedZoneCommand,
  GetChangeCommand,
  GetHostedZoneCommand,
  HostedZone,
  ListResourceRecordSetsCommand,
  ListResourceRecordSetsCommandOutput,
  ResourceRecordSet,
  Route53Client,
} from "@aws-sdk/client-route-53";
import { ResourceDestroyerParams } from "../ResourceDestroyer";
import { Poller } from "../poll";

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

async function listRecordSets(zoneId: string): Promise<ListResourceRecordSetsCommandOutput> {
  const client = getClient();
  const command = new ListResourceRecordSetsCommand({ HostedZoneId: zoneId });
  const response = await client.send(command);
  return response;
}

async function deleteRecordSets(zoneId: string, recordSets: ResourceRecordSet[], poller: Poller): Promise<void> {
  const client = getClient();
  const command = new ChangeResourceRecordSetsCommand({
    HostedZoneId: zoneId,
    ChangeBatch: {
      Changes: recordSets.map((rs) => ({
        Action: ChangeAction.DELETE,
        ResourceRecordSet: rs,
      })),
    },
  });
  const response = await client.send(command);

  const change = response.ChangeInfo;
  if (change?.Id) {
    await poller(
      async () => {
        const command = new GetChangeCommand({
          Id: change.Id,
        });
        const response = await client.send(command);
        return response.ChangeInfo?.Status === "INSYNC";
      },
      { description: `${recordSets.length} DNS record sets to be deleted` }
    );
  }
}

export async function deleteHostedZone({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  for (;;) {
    const response = await listRecordSets(resourceId);
    if (!response.ResourceRecordSets?.length) break;

    const recordSets = response.ResourceRecordSets.filter((rs) => rs.Type !== "NS" && rs.Type !== "SOA");
    if (recordSets.length) {
      await deleteRecordSets(resourceId, recordSets, poller);
    }

    if (!response.IsTruncated) break;
  }

  const client = getClient();
  const command = new DeleteHostedZoneCommand({
    Id: resourceId,
  });
  await client.send(command);
}
