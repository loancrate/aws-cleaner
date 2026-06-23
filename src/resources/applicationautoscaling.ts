import {
  ApplicationAutoScalingClient,
  DeregisterScalableTargetCommand,
  DescribeScalableTargetsCommand,
  ObjectNotFoundException,
  ScalableTarget,
  ServiceNamespace,
} from "@aws-sdk/client-application-auto-scaling";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: ApplicationAutoScalingClient | undefined;

function getClient(): ApplicationAutoScalingClient {
  if (!client) {
    client = new ApplicationAutoScalingClient({});
  }
  return client;
}

// The scalable target ARN exposes only an opaque id, but DeregisterScalableTarget needs the
// service namespace, resource id, and scalable dimension. There is no API to look a target up
// by ARN: DescribeScalableTargets requires a service namespace, and its ResourceIds filter
// expects the underlying resource's id (e.g. service/cluster/service), not the opaque id in
// the ARN. So the only way to resolve the ARN is to describe each service namespace and match
// on ScalableTargetARN.
async function findScalableTarget(arn: string): Promise<ScalableTarget | undefined> {
  const client = getClient();
  for (const serviceNamespace of Object.values(ServiceNamespace)) {
    for (let NextToken: string | undefined; ; ) {
      const response = await client.send(
        new DescribeScalableTargetsCommand({ ServiceNamespace: serviceNamespace, NextToken }),
      );
      const target = response.ScalableTargets?.find((t) => t.ScalableTargetARN === arn);
      if (target) return target;
      NextToken = response.NextToken;
      if (!NextToken) break;
    }
  }
  return undefined;
}

export async function deleteScalableTarget({ arn }: Pick<ResourceDestroyerParams, "arn">): Promise<void> {
  const target = await findScalableTarget(arn);
  if (!target) return;
  const client = getClient();
  const command = new DeregisterScalableTargetCommand({
    ServiceNamespace: target.ServiceNamespace,
    ResourceId: target.ResourceId,
    ScalableDimension: target.ScalableDimension,
  });
  try {
    await client.send(command);
  } catch (err) {
    if (!(err instanceof ObjectNotFoundException)) throw err;
  }
}
