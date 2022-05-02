import {
  DBCluster,
  DBClusterSnapshot,
  DBInstance,
  DBSnapshot,
  DeleteDBClusterCommand,
  DeleteDBClusterParameterGroupCommand,
  DeleteDBClusterSnapshotCommand,
  DeleteDBInstanceCommand,
  DeleteDBParameterGroupCommand,
  DeleteDBSnapshotCommand,
  DeleteDBSubnetGroupCommand,
  DescribeDBClustersCommand,
  DescribeDBClusterSnapshotsCommand,
  DescribeDBInstancesCommand,
  DescribeDBSnapshotsCommand,
  RDSClient,
} from "@aws-sdk/client-rds";
import { getErrorCode } from "../awserror.js";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: RDSClient | undefined;

function getClient(): RDSClient {
  if (!client) {
    client = new RDSClient({});
  }
  return client;
}

export async function deleteDatabaseCluster({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  try {
    const client = getClient();
    const command = new DeleteDBClusterCommand({
      DBClusterIdentifier: resourceId,
      SkipFinalSnapshot: true,
    });
    await client.send(command);

    await poller(
      async () => {
        const cluster = await describeDBCluster(resourceId);
        return !cluster;
      },
      { description: `RDS cluster ${resourceId} to be deleted` }
    );
  } catch (err) {
    if (getErrorCode(err) !== "DBClusterNotFoundFault") throw err;
  }
}

async function describeDBCluster(DBClusterIdentifier: string): Promise<DBCluster | undefined> {
  const client = getClient();
  const command = new DescribeDBClustersCommand({ DBClusterIdentifier });
  const response = await client.send(command);
  return response.DBClusters?.[0];
}

export async function deleteDatabaseClusterParameterGroup({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteDBClusterParameterGroupCommand({
    DBClusterParameterGroupName: resourceId,
  });
  await client.send(command);
}

export async function deleteDatabaseClusterSnapshot({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  try {
    const client = getClient();
    const command = new DeleteDBClusterSnapshotCommand({
      DBClusterSnapshotIdentifier: resourceId,
    });
    await client.send(command);

    await poller(
      async () => {
        const snapshot = await describeDBClusterSnapshots(resourceId);
        return !snapshot;
      },
      { description: `RDS cluster snapshot ${resourceId} to be deleted` }
    );
  } catch (err) {
    // "Only manual snapshots may be deleted."
    const code = getErrorCode(err);
    if (code !== "DBClusterSnapshotNotFoundFault" && code !== "InvalidDBClusterSnapshotStateFault") throw err;
  }
}

async function describeDBClusterSnapshots(DBClusterSnapshotIdentifier: string): Promise<DBClusterSnapshot | undefined> {
  const client = getClient();
  const command = new DescribeDBClusterSnapshotsCommand({ DBClusterSnapshotIdentifier });
  const response = await client.send(command);
  return response.DBClusterSnapshots?.[0];
}

export async function deleteDatabaseInstance({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  try {
    const client = getClient();
    const command = new DeleteDBInstanceCommand({
      DBInstanceIdentifier: resourceId,
      DeleteAutomatedBackups: true,
      SkipFinalSnapshot: true,
    });
    await client.send(command);

    await poller(
      async () => {
        const instance = await describeDBInstance(resourceId);
        return !instance;
      },
      { description: `RDS instance ${resourceId} to be deleted` }
    );
  } catch (err) {
    if (getErrorCode(err) !== "DBInstanceNotFound") throw err;
  }
}

async function describeDBInstance(DBInstanceIdentifier: string): Promise<DBInstance | undefined> {
  const client = getClient();
  const command = new DescribeDBInstancesCommand({ DBInstanceIdentifier });
  const response = await client.send(command);
  return response.DBInstances?.[0];
}

export async function deleteDatabaseParameterGroup({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteDBParameterGroupCommand({
    DBParameterGroupName: resourceId,
  });
  await client.send(command);
}

export async function deleteDatabaseSnapshot({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  const client = getClient();
  const command = new DeleteDBSnapshotCommand({
    DBSnapshotIdentifier: resourceId,
  });
  await client.send(command);

  await poller(
    async () => {
      const snapshot = await describeDBSnapshots(resourceId);
      return !snapshot;
    },
    { description: `RDS snapshot ${resourceId} to be deleted` }
  );
}

async function describeDBSnapshots(DBSnapshotIdentifier: string): Promise<DBSnapshot | undefined> {
  const client = getClient();
  const command = new DescribeDBSnapshotsCommand({ DBSnapshotIdentifier });
  const response = await client.send(command);
  return response.DBSnapshots?.[0];
}

export async function deleteDatabaseSubnetGroup({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeleteDBSubnetGroupCommand({
    DBSubnetGroupName: resourceId,
  });
  await client.send(command);
}
