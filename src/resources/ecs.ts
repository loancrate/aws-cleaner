import {
  DeleteClusterCommand,
  DeleteServiceCommand,
  DeleteTaskDefinitionsCommand,
  DeregisterContainerInstanceCommand,
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
const taskDefDeleteRateLimiter = new RateLimiter({ windowMs: 1000, maxTokens: 5, fillRate: 1 });
const taskDefModifyRateLimiter = new RateLimiter({ windowMs: 1000, maxTokens: 20, fillRate: 1 });
const taskDefReadRateLimiter = new RateLimiter({ windowMs: 1000, maxTokens: 50, fillRate: 20 });
const clusterResourceModifyRateLimiter = new RateLimiter({ windowMs: 1000, maxTokens: 100, fillRate: 40 });
const clusterResourceReadRateLimiter = new RateLimiter({ windowMs: 1000, maxTokens: 100, fillRate: 20 });
const clusterServiceResourceModifyRateLimiter = new RateLimiter({ windowMs: 1000, maxTokens: 50, fillRate: 5 });

const maxTaskDefsPerDelete = 10;

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
          }),
        );
      }
      return !taskArns.length;
    },
    { description: `tasks to terminate in ECS cluster ${cluster}` },
  );

  const client = getClient();
  const command = new DeleteClusterCommand({ cluster });
  await throttle(clusterModifyRateLimiter, () => client.send(command));
}

export async function deleteContainerInstance({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const [cluster, instanceId] = resourceId.split("/", 2);

  const client = getClient();
  const command = new DeregisterContainerInstanceCommand({
    cluster,
    containerInstance: instanceId,
    force: true,
  });
  await throttle(clusterResourceModifyRateLimiter, () => client.send(command));
}

export async function deleteService({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  const [cluster, service] = resourceId.split("/", 2);

  const taskArns = await listTasks(cluster, service);

  const client = getClient();
  const command = new DeleteServiceCommand({ cluster, service, force: true });
  try {
    await throttle(clusterServiceResourceModifyRateLimiter, () => client.send(command));
  } catch (err) {
    if (getErrorCode(err) !== "ServiceNotFoundException") throw err;
  }

  if (taskArns.length > 0) {
    await poller(
      async () => {
        const tasks = await describeTasks(cluster, taskArns);
        const notStopped = tasks.filter((task) => task.lastStatus !== "STOPPED");
        return !notStopped.length;
      },
      { description: `${service} tasks to terminate in ECS cluster ${cluster}` },
    );
  }
}

export async function deleteTask({
  resourceId,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  const [cluster, task] = resourceId.split("/", 2);
  try {
    await stopTask(cluster, task, "Deleting task");
  } catch (err) {
    // Ignore "The referenced task was not found"
    if (getErrorCode(err) !== "InvalidParameterException") throw err;
  }
}

async function listTasks(cluster: string, serviceName?: string, desiredStatus?: DesiredStatus): Promise<string[]> {
  const client = getClient();
  const command = new ListTasksCommand({ cluster, serviceName, desiredStatus });
  try {
    const response = await throttle(clusterResourceReadRateLimiter, () => client.send(command));
    return response.taskArns || [];
  } catch (err) {
    if (getErrorCode(err) === "ServiceNotFoundException") {
      return [];
    }
    throw err;
  }
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

async function listTaskDefinitions(
  familyPrefix?: string,
  status: TaskDefinitionStatus = TaskDefinitionStatus.ACTIVE,
): Promise<string[]> {
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

async function deregisterTaskDefinition(taskDefinition: string): Promise<void> {
  const client = getClient();
  const command = new DeregisterTaskDefinitionCommand({ taskDefinition });
  await throttle(taskDefModifyRateLimiter, () => client.send(command));
}

async function deleteTaskDefinitions(taskDefinitions: string[]): Promise<void> {
  const client = getClient();
  const command = new DeleteTaskDefinitionsCommand({ taskDefinitions });
  await throttle(taskDefDeleteRateLimiter, () => client.send(command));
}

export async function deleteTaskDefinition({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  await deregisterTaskDefinition(resourceId);
  await deleteTaskDefinitions([resourceId]);
}

export async function listTaskDefinitionFamilies(
  familyPrefix?: string,
  status: TaskDefinitionFamilyStatus = TaskDefinitionFamilyStatus.ACTIVE,
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
  const activeTaskDefs = await listTaskDefinitions(resourceId);
  if (activeTaskDefs.length) {
    logger.info(`Deregistering ${activeTaskDefs.length} revisions of task definition ${resourceId}`);
    for (const arn of activeTaskDefs) {
      logger.info(`Deregistering revision ${getRevision(arn)} of task definition ${resourceId}`);
      await deregisterTaskDefinition(arn);
    }
  }

  const inactiveTaskDefs = await listTaskDefinitions(resourceId, TaskDefinitionStatus.INACTIVE);
  if (inactiveTaskDefs.length) {
    logger.info(`Deleting ${inactiveTaskDefs.length} revisions of task definition ${resourceId}`);
    for (let i = 0; i < inactiveTaskDefs.length; i += maxTaskDefsPerDelete) {
      const page = inactiveTaskDefs.slice(i, i + maxTaskDefsPerDelete);
      const first = getRevision(page[0]);
      const last = getRevision(page[page.length - 1]);
      logger.info(`Deleting revisions ${first} to ${last} of task definition ${resourceId}`);
      await deleteTaskDefinitions(page);
    }
  }
}

function getRevision(taskDefArn: string): number {
  const revisionIndex = taskDefArn.lastIndexOf(":");
  if (revisionIndex < 0) {
    return 0;
  }
  return parseInt(taskDefArn.substring(revisionIndex + 1));
}
