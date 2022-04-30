import {
  DeleteDBClusterCommand,
  DeleteDBClusterParameterGroupCommand,
  DeleteDBClusterSnapshotCommand,
  DeleteDBInstanceCommand,
  DeleteDBParameterGroupCommand,
  DeleteDBSnapshotCommand,
  DeleteDBSubnetGroupCommand,
  RDSClient,
} from "@aws-sdk/client-rds";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

export async function deleteDatabaseCluster({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new RDSClient({});
  const command = new DeleteDBClusterCommand({
    DBClusterIdentifier: resourceId,
    SkipFinalSnapshot: true,
  });
  await client.send(command);
}

export async function deleteDatabaseClusterParameterGroup({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new RDSClient({});
  const command = new DeleteDBClusterParameterGroupCommand({
    DBClusterParameterGroupName: resourceId,
  });
  await client.send(command);
}

export async function deleteDatabaseClusterSnapshot({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new RDSClient({});
  const command = new DeleteDBClusterSnapshotCommand({
    DBClusterSnapshotIdentifier: resourceId,
  });
  await client.send(command);
}

export async function deleteDatabaseInstance({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new RDSClient({});
  const command = new DeleteDBInstanceCommand({
    DBInstanceIdentifier: resourceId,
    DeleteAutomatedBackups: true,
    SkipFinalSnapshot: true,
  });
  await client.send(command);
}

export async function deleteDatabaseParameterGroup({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new RDSClient({});
  const command = new DeleteDBParameterGroupCommand({
    DBParameterGroupName: resourceId,
  });
  await client.send(command);
}

export async function deleteDatabaseSnapshot({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new RDSClient({});
  const command = new DeleteDBSnapshotCommand({
    DBSnapshotIdentifier: resourceId,
  });
  await client.send(command);
}

export async function deleteDatabaseSubnetGroup({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new RDSClient({});
  const command = new DeleteDBSubnetGroupCommand({
    DBSubnetGroupName: resourceId,
  });
  await client.send(command);
}
