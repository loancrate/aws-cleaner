import {
  DeleteClusterCommand,
  DeleteServiceCommand,
  DeregisterTaskDefinitionCommand,
  DescribeTasksCommand,
  DesiredStatus,
  ECSClient,
  ListTaskDefinitionFamiliesCommand,
  ListTaskDefinitionsCommand,
  ListTasksCommand,
  StopTaskCommand,
  Task,
  TaskDefinitionFamilyStatus,
  TaskDefinitionStatus,
} from "@aws-sdk/client-ecs";
import { setTimeout } from "timers/promises";
import { getErrorCode } from "../awserror.js";
import logger from "../logger.js";
import { RateLimiter } from "../RateLimiter.js";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: ECSClient | undefined;

function getClient(): ECSClient {
  if (!client) {
    client = new ECSClient({});
  }
  return client;
}

// https://docs.aws.amazon.com/AmazonECS/latest/APIReference/request-throttling.html
const clusterModifyRateLimiter = new RateLimiter({ windowMs: 1000, maxTokens: 20, fillRate: 1 });
const taskDefModifyRateLimiter = new RateLimiter({ windowMs: 1000, maxTokens: 20, fillRate: 1 });
const taskDefReadRateLimiter = new RateLimiter({ windowMs: 1000, maxTokens: 50, fillRate: 20 });
const clusterResourceModifyRateLimiter = new RateLimiter({ windowMs: 1000, maxTokens: 100, fillRate: 40 });
const clusterResourceReadRateLimiter = new RateLimiter({ windowMs: 1000, maxTokens: 100, fillRate: 20 });
const clusterServiceResourceModifyRateLimiter = new RateLimiter({ windowMs: 1000, maxTokens: 50, fillRate: 5 });

async function throttle<T>(rateLimiter: RateLimiter, task: () => Promise<T>): Promise<T> {
  let backOffMs = 1000;
  for (;;) {
    await rateLimiter.wait();
    try {
      return await task();
    } catch (err) {
      if (getErrorCode(err) !== "ThrottlingException") throw err;
      rateLimiter.empty();
      logger.debug(`ECS API throttled, waiting ${backOffMs} ms`);
      await setTimeout(backOffMs);
      backOffMs *= 2;
    }
  }
}

export async function deleteCluster({
  resourceId: cluster,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  await poller(
    async () => {
      const taskArns = await listTasks(cluster, undefined, DesiredStatus.RUNNING);
      if (taskArns.length > 0) {
        await Promise.all(
          taskArns.map(async (arn) => {
            logger.debug(`Stopping task ${arn} in ECS cluster ${cluster}`);
            return await stopTask(cluster, arn, "Deleting cluster");
          })
        );
      }
      return !taskArns.length;
    },
    { description: `tasks to terminate in ECS cluster ${cluster}` }
  );

  const client = getClient();
  const command = new DeleteClusterCommand({ cluster });
  await throttle(clusterModifyRateLimiter, () => client.send(command));
}

export async function deleteService({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  const [cluster, service] = resourceId.split("/", 2);

  const taskArns = await listTasks(cluster, service);

  const client = getClient();
  const command = new DeleteServiceCommand({ cluster, service, force: true });
  await throttle(clusterServiceResourceModifyRateLimiter, () => client.send(command));

  if (taskArns.length > 0) {
    await poller(
      async () => {
        const tasks = await describeTasks(cluster, taskArns);
        const notStopped = tasks.filter((task) => task.lastStatus !== "STOPPED");
        return !notStopped.length;
      },
      { description: `${service} tasks to terminate in ECS cluster ${cluster}` }
    );
  }
}

async function listTasks(cluster: string, serviceName?: string, desiredStatus?: DesiredStatus): Promise<string[]> {
  const client = getClient();
  const command = new ListTasksCommand({ cluster, serviceName, desiredStatus });
  const response = await throttle(clusterResourceReadRateLimiter, () => client.send(command));
  return response.taskArns || [];
}

async function describeTasks(cluster: string, tasks: string[]): Promise<Task[]> {
  const client = getClient();
  const command = new DescribeTasksCommand({ cluster, tasks });
  const response = await throttle(clusterResourceReadRateLimiter, () => client.send(command));
  return response.tasks || [];
}

async function stopTask(cluster: string, task: string, reason?: string): Promise<Task | undefined> {
  const client = getClient();
  const command = new StopTaskCommand({ cluster, task, reason });
  const response = await throttle(clusterResourceModifyRateLimiter, () => client.send(command));
  return response.task;
}

async function listTaskDefinitions(familyPrefix?: string, status = TaskDefinitionStatus.ACTIVE): Promise<string[]> {
  const result: string[] = [];
  for (let nextToken: string | undefined; ; ) {
    const client = getClient();
    const command = new ListTaskDefinitionsCommand({ familyPrefix, status, nextToken });
    const response = await throttle(taskDefReadRateLimiter, () => client.send(command));
    if (!response.taskDefinitionArns) break;
    result.push(...response.taskDefinitionArns);
    nextToken = response.nextToken;
    if (!nextToken) break;
  }
  return result;
}

export async function deleteTaskDefinition({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeregisterTaskDefinitionCommand({ taskDefinition: resourceId });
  await throttle(taskDefModifyRateLimiter, () => client.send(command));
}

export async function listTaskDefinitionFamilies(
  familyPrefix?: string,
  status = TaskDefinitionFamilyStatus.ACTIVE
): Promise<string[]> {
  const result: string[] = [];
  for (let nextToken: string | undefined; ; ) {
    const client = getClient();
    const command = new ListTaskDefinitionFamiliesCommand({ familyPrefix, status, nextToken });
    const response = await throttle(taskDefReadRateLimiter, () => client.send(command));
    if (!response.families) break;
    result.push(...response.families);
    nextToken = response.nextToken;
    if (!nextToken) break;
  }
  return result;
}

export async function deleteTaskDefinitionFamily({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const taskDefArns = await listTaskDefinitions(resourceId);
  for (const arn of taskDefArns) {
    const revisionIndex = arn.lastIndexOf(":");
    if (revisionIndex > 0) {
      const revision = arn.substring(revisionIndex + 1);
      logger.info(`Deregistering revision ${revision} of task definition ${resourceId}`);
    }
    await deleteTaskDefinition({ resourceId: arn });
  }
}
