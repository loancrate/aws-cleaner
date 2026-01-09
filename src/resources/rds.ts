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
  ModifyDBClusterCommand,
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
    await disableDeletionProtection(resourceId);
  } catch (err) {
    if (getErrorCode(err) !== "DBClusterNotFoundFault") throw err;
    // Cluster doesn't exist, nothing to delete
    return;
  }

  try {
    const client = getClient();
    const command = new DeleteDBClusterCommand({
      DBClusterIdentifier: resourceId,
      SkipFinalSnapshot: true,
    });
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) !== "DBClusterNotFoundFault") throw err;
  }

  await poller(
    async () => {
      const cluster = await describeDBCluster(resourceId);
      return !cluster;
    },
    { description: `RDS cluster ${resourceId} to be deleted` },
  );
}

async function disableDeletionProtection(DBClusterIdentifier: string): Promise<void> {
  const client = getClient();
  const command = new ModifyDBClusterCommand({
    DBClusterIdentifier,
    DeletionProtection: false,
  });
  await client.send(command);
}

async function describeDBCluster(DBClusterIdentifier: string): Promise<DBCluster | undefined> {
  try {
    const client = getClient();
    const command = new DescribeDBClustersCommand({ DBClusterIdentifier });
    const response = await client.send(command);
    return response.DBClusters?.[0];
  } catch (err) {
    if (getErrorCode(err) === "DBClusterNotFoundFault") return undefined;
    throw err;
  }
}

export async function deleteDatabaseClusterParameterGroup({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  try {
    const client = getClient();
    const command = new DeleteDBClusterParameterGroupCommand({
      DBClusterParameterGroupName: resourceId,
    });
    await client.send(command);
  } catch (err) {
    const code = getErrorCode(err);
    if (code === "DBClusterParameterGroupNotFoundFault" || code === "DBClusterParameterGroupNotFound") {
      return;
    }
    throw err;
  }
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
  } catch (err) {
    const code = getErrorCode(err);
    if (code === "DBClusterSnapshotNotFoundFault") return;
    if (code !== "InvalidDBClusterSnapshotStateFault") throw err;
  }

  await poller(
    async () => {
      const snapshot = await describeDBClusterSnapshots(resourceId);
      // "Only manual snapshots may be deleted."
      return !snapshot || snapshot.SnapshotType !== "manual";
    },
    { description: `RDS cluster snapshot ${resourceId} to be deleted` },
  );
}

async function describeDBClusterSnapshots(DBClusterSnapshotIdentifier: string): Promise<DBClusterSnapshot | undefined> {
  try {
    const client = getClient();
    const command = new DescribeDBClusterSnapshotsCommand({ DBClusterSnapshotIdentifier });
    const response = await client.send(command);
    return response.DBClusterSnapshots?.[0];
  } catch (err) {
    if (getErrorCode(err) === "DBClusterSnapshotNotFoundFault") return undefined;
    throw err;
  }
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
  } catch (err) {
    const code = getErrorCode(err);
    if (code === "DBInstanceNotFound") return;
    if (code !== "InvalidDBInstanceState") throw err;
  }

  await poller(
    async () => {
      const instance = await describeDBInstance(resourceId);
      return !instance;
    },
    { description: `RDS instance ${resourceId} to be deleted` },
  );
}

async function describeDBInstance(DBInstanceIdentifier: string): Promise<DBInstance | undefined> {
  try {
    const client = getClient();
    const command = new DescribeDBInstancesCommand({ DBInstanceIdentifier });
    const response = await client.send(command);
    return response.DBInstances?.[0];
  } catch (err) {
    if (getErrorCode(err) === "DBInstanceNotFound") return undefined;
    throw err;
  }
}

export async function deleteDatabaseParameterGroup({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  try {
    const client = getClient();
    const command = new DeleteDBParameterGroupCommand({
      DBParameterGroupName: resourceId,
    });
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) !== "DBParameterGroupNotFoundFault") throw err;
  }
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
    { description: `RDS snapshot ${resourceId} to be deleted` },
  );
}

async function describeDBSnapshots(DBSnapshotIdentifier: string): Promise<DBSnapshot | undefined> {
  try {
    const client = getClient();
    const command = new DescribeDBSnapshotsCommand({ DBSnapshotIdentifier });
    const response = await client.send(command);
    return response.DBSnapshots?.[0];
  } catch (err) {
    if (getErrorCode(err) === "DBSnapshotNotFound") return undefined;
    throw err;
  }
}

export async function deleteDatabaseSubnetGroup({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  try {
    const client = getClient();
    const command = new DeleteDBSubnetGroupCommand({
      DBSubnetGroupName: resourceId,
    });
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) !== "DBSubnetGroupNotFoundFault") throw err;
  }
}
