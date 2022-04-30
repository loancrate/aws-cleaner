import {
  ElastiCacheClient,
  DeleteCacheClusterCommand,
  DescribeCacheClustersCommand,
  CacheCluster,
  DeleteCacheSubnetGroupCommand,
} from "@aws-sdk/client-elasticache";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

async function describeCacheCluster(clusterId: string): Promise<CacheCluster | undefined> {
  const client = new ElastiCacheClient({});
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
  const client = new ElastiCacheClient({});
  const command = new DeleteCacheClusterCommand({
    CacheClusterId: resourceId,
  });
  await client.send(command);
  await poller(async () => {
    const cluster = await describeCacheCluster(resourceId);
    return !cluster || cluster.CacheClusterStatus === "deleted";
  });
}

export async function deleteCacheSubnetGroup({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new ElastiCacheClient({});
  const command = new DeleteCacheSubnetGroupCommand({
    CacheSubnetGroupName: resourceId,
  });
  await client.send(command);
}
