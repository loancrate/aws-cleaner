import {
  CacheCluster,
  CacheParameterGroup,
  DeleteCacheClusterCommand,
  DeleteCacheParameterGroupCommand,
  DeleteCacheSubnetGroupCommand,
  DeleteReplicationGroupCommand,
  DeleteSnapshotCommand,
  DescribeCacheClustersCommand,
  DescribeCacheParameterGroupsCommand,
  DescribeReplicationGroupsCommand,
  ElastiCacheClient,
  ReplicationGroup,
} from "@aws-sdk/client-elasticache";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";
import { hasErrorCode } from "../awserror.js";

let client: ElastiCacheClient | undefined;

function getClient(): ElastiCacheClient {
  if (!client) {
    client = new ElastiCacheClient({});
  }
  return client;
}

const cacheClusterNotFoundCodes = ["CacheClusterNotFound", "CacheClusterNotFoundFault"];

async function describeCacheCluster(clusterId: string): Promise<CacheCluster | undefined> {
  try {
    const client = getClient();
    const command = new DescribeCacheClustersCommand({
      CacheClusterId: clusterId,
    });
    const output = await client.send(command);
    return output.CacheClusters?.[0];
  } catch (err) {
    if (hasErrorCode(err, cacheClusterNotFoundCodes)) return undefined;
    throw err;
  }
}

export async function deleteCacheCluster({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  const cluster = await describeCacheCluster(resourceId);
  if (!cluster) return;

  if (cluster.ReplicationGroupId) {
    // Deleting the replication group will automatically delete all its clusters,
    // so just poll below for this cluster to be deleted along with it
    await deleteReplicationGroup({ resourceId: cluster.ReplicationGroupId, poller });
  } else if (cluster.CacheClusterStatus !== "deleting") {
    // Standalone cluster without replication group - delete directly
    try {
      const client = getClient();
      const command = new DeleteCacheClusterCommand({
        CacheClusterId: resourceId,
      });
      await client.send(command);
    } catch (err) {
      if (hasErrorCode(err, cacheClusterNotFoundCodes)) return;
      if (!hasErrorCode(err, "InvalidCacheClusterStateFault")) throw err;
      // Deletion started between the describe above and this request, so just wait for it below
      const cluster = await describeCacheCluster(resourceId);
      if (cluster && cluster.CacheClusterStatus !== "deleting") throw err;
    }
  }

  await poller(
    async () => {
      const cluster = await describeCacheCluster(resourceId);
      return !cluster || cluster.CacheClusterStatus === "deleted";
    },
    { description: `ElastiCache cluster ${resourceId} to be deleted` },
  );
}

export async function describeParameterGroup(id: string): Promise<CacheParameterGroup | undefined> {
  const client = getClient();
  const command = new DescribeCacheParameterGroupsCommand({
    CacheParameterGroupName: id,
  });
  const output = await client.send(command);
  return output.CacheParameterGroups?.[0];
}

export async function deleteParameterGroup({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  try {
    const client = getClient();
    const command = new DeleteCacheParameterGroupCommand({
      CacheParameterGroupName: resourceId,
    });
    await client.send(command);
  } catch (err) {
    if (!hasErrorCode(err, ["CacheParameterGroupNotFound", "CacheParameterGroupNotFoundFault"])) throw err;
  }
}

async function describeReplicationGroup(id: string): Promise<ReplicationGroup | undefined> {
  try {
    const client = getClient();
    const command = new DescribeReplicationGroupsCommand({
      ReplicationGroupId: id,
    });
    const output = await client.send(command);
    return output.ReplicationGroups?.[0];
  } catch (err) {
    if (hasErrorCode(err, "ReplicationGroupNotFoundFault")) return undefined;
    throw err;
  }
}

export async function deleteReplicationGroup({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  try {
    const client = getClient();
    const command = new DeleteReplicationGroupCommand({
      ReplicationGroupId: resourceId,
    });
    await client.send(command);
  } catch (err) {
    if (hasErrorCode(err, "ReplicationGroupNotFoundFault")) return;
    if (!hasErrorCode(err, "InvalidReplicationGroupStateFault")) throw err;
    // Deletion is already in progress, typically because another cluster in the same
    // replication group requested it concurrently, so just wait for it to finish.
    const group = await describeReplicationGroup(resourceId);
    if (group && group.Status !== "deleting") throw err;
  }

  await poller(
    async () => {
      const group = await describeReplicationGroup(resourceId);
      return !group || group.Status === "deleted";
    },
    { description: `ElastiCache replication group ${resourceId} to be deleted` },
  );
}

export async function deleteCacheSnapshot({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteSnapshotCommand({
    SnapshotName: resourceId,
  });
  await client.send(command);
}

export async function deleteCacheSubnetGroup({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  try {
    const client = getClient();
    const command = new DeleteCacheSubnetGroupCommand({
      CacheSubnetGroupName: resourceId,
    });
    await client.send(command);
  } catch (err) {
    if (!hasErrorCode(err, "CacheSubnetGroupNotFoundFault")) throw err;
  }
}
