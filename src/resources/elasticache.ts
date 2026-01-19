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
import { getErrorCode } from "../awserror.js";

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
    const cluster = await describeCacheCluster(resourceId);
    if (cluster?.ReplicationGroupId) {
      // Deleting the replication group will automatically delete all its clusters
      await deleteReplicationGroup({ resourceId: cluster.ReplicationGroupId, poller });

      // Just poll for the cluster to be deleted as part of the replication group deletion
      await poller(
        async () => {
          const cluster = await describeCacheCluster(resourceId);
          return !cluster || cluster.CacheClusterStatus === "deleted";
        },
        { description: `ElastiCache cluster ${resourceId} to be deleted` },
      );
      return;
    }

    // Standalone cluster without replication group - delete directly
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
      { description: `ElastiCache cluster ${resourceId} to be deleted` },
    );
  } catch (err) {
    if (getErrorCode(err) !== "CacheClusterNotFound") throw err;
  }
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
    const code = getErrorCode(err);
    if (code !== "CacheParameterGroupNotFound" && code !== "CacheParameterGroupNotFoundFault") throw err;
  }
}

async function describeReplicationGroup(id: string): Promise<ReplicationGroup | undefined> {
  const client = getClient();
  const command = new DescribeReplicationGroupsCommand({
    ReplicationGroupId: id,
  });
  const output = await client.send(command);
  return output.ReplicationGroups?.[0];
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

    await poller(
      async () => {
        const group = await describeReplicationGroup(resourceId);
        return !group || group.Status === "deleted";
      },
      { description: `ElastiCache replication group ${resourceId} to be deleted` },
    );
  } catch (err) {
    if (getErrorCode(err) !== "ReplicationGroupNotFoundFault") throw err;
  }
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
    if (getErrorCode(err) !== "CacheSubnetGroupNotFoundFault") throw err;
  }
}
