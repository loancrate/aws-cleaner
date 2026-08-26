import {
  ApplicationAutoScalingClient,
  DeregisterScalableTargetCommand,
  DescribeScalableTargetsCommand,
  ObjectNotFoundException,
  ScalableTarget,
  ServiceNamespace,
} from "@aws-sdk/client-application-auto-scaling";
import { setTimeout } from "timers/promises";
import { hasErrorCode } from "../awserror.js";
import logger from "../logger.js";
import { RateLimiter } from "../RateLimiter.js";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: ApplicationAutoScalingClient | undefined;

function getClient(): ApplicationAutoScalingClient {
  if (!client) {
    client = new ApplicationAutoScalingClient({});
  }
  return client;
}

// Application Auto Scaling doesn't publish request rate quotas, and resolving a single target ARN
// costs one DescribeScalableTargets call per service namespace (see findScalableTarget below), so
// these limits are deliberately conservative.
const describeRateLimiter = new RateLimiter({ windowMs: 1000, maxTokens: 20, fillRate: 10 });
const deregisterRateLimiter = new RateLimiter({ windowMs: 1000, maxTokens: 10, fillRate: 5 });

// Throttling isn't modeled by the SDK for this service; it arrives as a generic exception whose
// code is ThrottlingException and whose message is "Rate exceeded".
const throttlingErrorCodes = ["ThrottlingException", "Throttling", "TooManyRequestsException"];

async function throttle<T>(rateLimiter: RateLimiter, task: () => Promise<T>): Promise<T> {
  let backOffMs = 1000;
  for (;;) {
    await rateLimiter.wait();
    try {
      return await task();
    } catch (err) {
      if (!hasErrorCode(err, throttlingErrorCodes)) throw err;
      rateLimiter.empty();
      logger.debug(`Application Auto Scaling API throttled, waiting ${backOffMs} ms`);
      await setTimeout(backOffMs);
      backOffMs *= 2;
    }
  }
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
      const command = new DescribeScalableTargetsCommand({ ServiceNamespace: serviceNamespace, NextToken });
      const response = await throttle(describeRateLimiter, () => client.send(command));
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
    await throttle(deregisterRateLimiter, () => client.send(command));
  } catch (err) {
    if (!(err instanceof ObjectNotFoundException)) throw err;
  }
}
