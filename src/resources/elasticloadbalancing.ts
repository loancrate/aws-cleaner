import {
  DeleteListenerCommand,
  DeleteLoadBalancerCommand,
  DeleteRuleCommand,
  DeleteTargetGroupCommand,
  DescribeLoadBalancersCommand,
  ElasticLoadBalancingV2Client,
  ModifyLoadBalancerAttributesCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";
import { getErrorCode } from "../awserror.js";

let client: ElasticLoadBalancingV2Client | undefined;

function getClient(): ElasticLoadBalancingV2Client {
  if (!client) {
    client = new ElasticLoadBalancingV2Client({});
  }
  return client;
}

export async function deleteListener({ arn }: Pick<ResourceDestroyerParams, "arn">): Promise<void> {
  const client = getClient();
  const command = new DeleteListenerCommand({ ListenerArn: arn });
  try {
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) !== "ListenerNotFound") throw err;
  }
}

export async function deleteListenerRule({ arn }: Pick<ResourceDestroyerParams, "arn">): Promise<void> {
  const client = getClient();
  const command = new DeleteRuleCommand({ RuleArn: arn });
  try {
    await client.send(command);
  } catch (err) {
    if (getErrorCode(err) !== "RuleNotFound") throw err;
  }
}

export async function deleteLoadBalancer({
  arn,
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "arn" | "resourceId" | "poller">): Promise<void> {
  try {
    await disableDeletionProtection(arn);

    const client = getClient();
    const command = new DeleteLoadBalancerCommand({ LoadBalancerArn: arn });
    await client.send(command);

    await poller(
      async () => {
        const command = new DescribeLoadBalancersCommand({ LoadBalancerArns: [arn] });
        const response = await client.send(command);
        return !response.LoadBalancers?.length;
      },
      { description: `ELB Load Balancer ${resourceId} to be deleted` }
    );
  } catch (err) {
    if (getErrorCode(err) !== "LoadBalancerNotFound") throw err;
  }
}

async function disableDeletionProtection(arn: string): Promise<void> {
  const client = getClient();
  const command = new ModifyLoadBalancerAttributesCommand({
    LoadBalancerArn: arn,
    Attributes: [{ Key: "deletion_protection.enabled", Value: "false" }],
  });
  await client.send(command);
}

export async function deleteTargetGroup({ arn }: Pick<ResourceDestroyerParams, "arn">): Promise<void> {
  const client = getClient();
  const command = new DeleteTargetGroupCommand({ TargetGroupArn: arn });
  await client.send(command);
}
