import {
  GetResourcesCommand,
  ResourceGroupsTaggingAPIClient,
  ResourceTagMapping,
} from "@aws-sdk/client-resource-groups-tagging-api";
import logger from "../logger.js";

let client: ResourceGroupsTaggingAPIClient | undefined;

function getClient(): ResourceGroupsTaggingAPIClient {
  if (!client) {
    client = new ResourceGroupsTaggingAPIClient({});
  }
  return client;
}

export type ResourceTagMappingWithArn = ResourceTagMapping & { ResourceARN: string };

export async function getResources(): Promise<ResourceTagMappingWithArn[]> {
  const result: ResourceTagMappingWithArn[] = [];
  const rgtClient = getClient();
  for (let PaginationToken: string | undefined, count = 0; ; ) {
    const command = new GetResourcesCommand({
      PaginationToken,
      ResourcesPerPage: 100,
    });
    const response = await rgtClient.send(command);
    if (response.ResourceTagMappingList) {
      const resources = response.ResourceTagMappingList;
      count += resources.length;
      for (const resource of resources) {
        if (!resource.ResourceARN) continue;
        result.push(resource as ResourceTagMappingWithArn);
      }
      logger.debug(`Fetched ${count} resources`);
    }
    PaginationToken = response.PaginationToken;
    if (!PaginationToken) break;
  }
  return result;
}
