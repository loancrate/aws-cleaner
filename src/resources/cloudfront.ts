import {
  CloudFrontClient,
  DeleteDistributionCommand,
  Distribution,
  GetDistributionCommand,
  GetDistributionConfigCommand,
  GetDistributionConfigCommandOutput,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";
import assert from "assert";

let client: CloudFrontClient | undefined;

function getClient(): CloudFrontClient {
  if (!client) {
    client = new CloudFrontClient({});
  }
  return client;
}

async function getDistribution(id: string): Promise<Distribution | undefined> {
  const client = getClient();
  const command = new GetDistributionCommand({ Id: id });
  const output = await client.send(command);
  return output.Distribution;
}

async function getDistributionConfig(id: string): Promise<GetDistributionConfigCommandOutput> {
  const client = getClient();
  const command = new GetDistributionConfigCommand({ Id: id });
  const output = await client.send(command);
  return output;
}

export async function disableCloudFrontDistribution({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<string | undefined> {
  const config = await getDistributionConfig(resourceId);
  assert(config.DistributionConfig?.CallerReference, "Distribution config caller reference not set");

  let etag = config.ETag;
  if (config.DistributionConfig.Enabled) {
    const client = getClient();
    const command = new UpdateDistributionCommand({
      Id: resourceId,
      IfMatch: config.ETag,
      DistributionConfig: {
        ...config.DistributionConfig,
        Enabled: false,
      },
    });
    const response = await client.send(command);
    etag = response.ETag;
  }

  await poller(
    async () => {
      const distribution = await getDistribution(resourceId);
      return distribution?.Status !== "InProgress";
    },
    { description: `distribution ${resourceId} to be disabled` }
  );

  return etag;
}

export async function deleteCloudFrontDistribution({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  const distribution = await getDistribution(resourceId);
  if (distribution) {
    let etag;
    if (distribution.Status !== "Disabled") {
      etag = await disableCloudFrontDistribution({ resourceId, poller });
    }

    const client = getClient();
    const command = new DeleteDistributionCommand({ Id: resourceId, IfMatch: etag });
    await client.send(command);
  }
}
