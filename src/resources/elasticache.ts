import {
  CacheCluster,
  DeleteCacheClusterCommand,
  DeleteCacheSubnetGroupCommand,
  DeleteReplicationGroupCommand,
  DeleteSnapshotCommand,
  DescribeCacheClustersCommand,
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
      await deleteReplicationGroup({ resourceId: cluster.ReplicationGroupId, poller });
    }

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
      { description: `ElastiCache replication group ${resourceId} to be deleted` }
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
  const client = getClient();
  const command = new DeleteCacheSubnetGroupCommand({
    CacheSubnetGroupName: resourceId,
  });
  await client.send(command);
}
