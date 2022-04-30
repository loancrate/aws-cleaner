import {
  DeleteListenerCommand,
  DeleteLoadBalancerCommand,
  DeleteTargetGroupCommand,
  ElasticLoadBalancingV2Client,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { getErrorCode } from "../awserror.js";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

export async function deleteListener({ arn }: Pick<ResourceDestroyerParams, "arn">): Promise<void> {
  const client = new ElasticLoadBalancingV2Client({});
  const command = new DeleteListenerCommand({ ListenerArn: arn });
  try {
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) !== "ListenerNotFound") throw err;
  }
}

export async function deleteLoadBalancer({ arn }: Pick<ResourceDestroyerParams, "arn">): Promise<void> {
  const client = new ElasticLoadBalancingV2Client({});
  const command = new DeleteLoadBalancerCommand({ LoadBalancerArn: arn });
  await client.send(command);
}

export async function deleteTargetGroup({ arn }: Pick<ResourceDestroyerParams, "arn">): Promise<void> {
  const client = new ElasticLoadBalancingV2Client({});
  const command = new DeleteTargetGroupCommand({ TargetGroupArn: arn });
  await client.send(command);
}
