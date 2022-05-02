import {
  CacheCluster,
  DeleteCacheClusterCommand,
  DeleteCacheSubnetGroupCommand,
  DescribeCacheClustersCommand,
  ElastiCacheClient,
} from "@aws-sdk/client-elasticache";
import { getErrorCode } from "../awserror.js";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: ElastiCacheClient | undefined;

function getClient(): ElastiCacheClient {
  if (!client) {
    client = new ElastiCacheClient({});
  }
  return client;
}

async function describeCacheCluster(clusterId: string): Promise<CacheCluster | undefined> {
  const client = getClient();
  const command = new DescribeCacheClustersCommand({
    CacheClusterId: clusterId,
  });
  const output = await client.send(command);
  return output.CacheClusters?.[0];
}

export async function deleteCacheCluster({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  try {
    const client = getClient();
    const command = new DeleteCacheClusterCommand({
      CacheClusterId: resourceId,
    });
    await client.send(command);

    await poller(
      async () => {
        const cluster = await describeCacheCluster(resourceId);
        return !cluster || cluster.CacheClusterStatus === "deleted";
      },
      { description: `ElastiCache cluster ${resourceId} to be deleted` }
    );
  } catch (err) {
    if (getErrorCode(err) !== "CacheClusterNotFound") throw err;
  }
}

export async function deleteCacheSubnetGroup({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteCacheSubnetGroupCommand({
    CacheSubnetGroupName: resourceId,
  });
  await client.send(command);
}
