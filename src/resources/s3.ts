import { S3Client, DeleteBucketCommand } from "@aws-sdk/client-s3";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

export async function deleteBucket({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = new S3Client({});
  const command = new DeleteBucketCommand({ Bucket: resourceId });
  await client.send(command);
}
