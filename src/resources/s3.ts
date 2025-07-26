import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectVersionsCommand, S3Client } from "@aws-sdk/client-s3";
import { getErrorCode } from "../awserror.js";
import logger from "../logger.js";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: S3Client | undefined;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({});
  }
  return client;
}

export async function deleteBucket({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  try {
    const client = getClient();

    for (let KeyMarker: string | undefined, VersionIdMarker: string | undefined; ; ) {
      const listCommand = new ListObjectVersionsCommand({ Bucket: resourceId, KeyMarker, VersionIdMarker });
      const listResponse = await client.send(listCommand);

      if (listResponse.Versions?.length) {
        logger.debug(`Deleting ${listResponse.Versions.length} object versions from S3 bucket ${resourceId}`);
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: resourceId,
          Delete: {
            Objects: listResponse.Versions.map((v) => ({ Key: v.Key, VersionId: v.VersionId })),
            Quiet: true,
          },
        });
        await client.send(deleteCommand);
      }

      if (listResponse.DeleteMarkers?.length) {
        logger.debug(`Deleting ${listResponse.DeleteMarkers.length} delete markers from S3 bucket ${resourceId}`);
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: resourceId,
          Delete: {
            Objects: listResponse.DeleteMarkers.map((v) => ({ Key: v.Key, VersionId: v.VersionId })),
            Quiet: true,
          },
        });
        await client.send(deleteCommand);
      }

      if (!listResponse.IsTruncated) break;
      KeyMarker = listResponse.NextKeyMarker;
      VersionIdMarker = listResponse.NextVersionIdMarker;
    }

    const command = new DeleteBucketCommand({ Bucket: resourceId });
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) === "NoSuchBucket") {
      return;
    }
    throw err;
  }
}
