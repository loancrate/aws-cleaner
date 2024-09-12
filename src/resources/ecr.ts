import {
  BatchDeleteImageCommand,
  DeleteRepositoryCommand,
  ECRClient,
  ImageIdentifier,
  ListImagesCommand,
  ListImagesCommandOutput,
} from "@aws-sdk/client-ecr";
import { getErrorCode } from "../awserror.js";
import logger from "../logger.js";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: ECRClient | undefined;

function getClient(): ECRClient {
  if (!client) {
    client = new ECRClient({});
  }
  return client;
}

async function deleteImages(repositoryName: string, imageIds: ImageIdentifier[]): Promise<void> {
  const client = getClient();
  const command = new BatchDeleteImageCommand({ repositoryName, imageIds });
  await client.send(command);
}

async function listImages(repositoryName: string, nextToken?: string): Promise<ListImagesCommandOutput> {
  const client = getClient();
  const command = new ListImagesCommand({ repositoryName, nextToken });
  return await client.send(command);
}

export async function deleteRepository({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  try {
    for (let nextToken: string | undefined; ; ) {
      const response = await listImages(resourceId, nextToken);
      if (!response.imageIds?.length) break;
      logger.debug(`Deleting ${response.imageIds.length} images from ECR repository ${resourceId}`);
      await deleteImages(resourceId, response.imageIds);
      nextToken = response.nextToken;
      if (!nextToken) break;
    }

    const client = getClient();
    const command = new DeleteRepositoryCommand({ repositoryName: resourceId, force: true });
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) !== "RepositoryNotFoundException") throw err;
  }
}
