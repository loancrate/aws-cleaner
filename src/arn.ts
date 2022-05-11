export interface ArnFields {
  partition: string;
  service: string;
  region: string;
  accountId: string;
  resourceId: string;
  resourceType?: string;
}

export interface ArnAndFields extends ArnFields {
  arn: string;
}

/*
arn:partition:service:region:account-id:resource-id
arn:partition:service:region:account-id:resource-type/resource-id
arn:partition:service:region:account-id:resource-type:resource-id
*/
export function parseArn(arn: string): ArnFields {
  const match = /^arn:([^:]*):([^:]*):([^:]*):([^:]*):([^:/]*)(?:[:/](.*))?$/.exec(arn);
  if (!match) {
    throw new Error(`Invalid ARN: ${arn}`);
  }
  const [, partition, service, region, accountId, idOrType, typedId] = match;
  const resourceId = typedId || idOrType;
  const resourceType = typedId ? idOrType : undefined;
  return { partition, service, region, accountId, resourceId, resourceType };
}

export function makeArn(fields: ArnFields, resourceTypeDelimiter = ":"): string {
  const { partition, service, region, accountId, resourceId, resourceType } = fields;
  const prefix = `arn:${partition}:${service}:${region}:${accountId}:`;
  return resourceType ? `${prefix}${resourceType}${resourceTypeDelimiter}${resourceId}` : `${prefix}${resourceId}`;
}
