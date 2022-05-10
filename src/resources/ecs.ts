import {
  DeleteClusterCommand,
  DeleteServiceCommand,
  DeregisterTaskDefinitionCommand,
  DescribeTasksCommand,
  DesiredStatus,
  ECSClient,
  ListTasksCommand,
  StopTaskCommand,
  Task,
} from "@aws-sdk/client-ecs";
import logger from "../logger.js";
import { ResourceDestroyerParams } from "../ResourceDestroyer.js";

let client: ECSClient | undefined;

function getClient(): ECSClient {
  if (!client) {
    client = new ECSClient({});
  }
  return client;
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
  await client.send(command);
}

export async function deleteService({
  resourceId,
  poller,
}: Pick<ResourceDestroyerParams, "resourceId" | "poller">): Promise<void> {
  const [cluster, service] = resourceId.split("/", 2);

  const taskArns = await listTasks(cluster, service);

  const client = getClient();
  const command = new DeleteServiceCommand({ cluster, service, force: true });
  await client.send(command);

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
  const response = await client.send(command);
  return response.taskArns || [];
}

async function describeTasks(cluster: string, tasks: string[]): Promise<Task[]> {
  const client = getClient();
  const command = new DescribeTasksCommand({ cluster, tasks });
  const response = await client.send(command);
  return response.tasks || [];
}

async function stopTask(cluster: string, task: string, reason?: string): Promise<Task | undefined> {
  const client = getClient();
  const command = new StopTaskCommand({ cluster, task, reason });
  const response = await client.send(command);
  return response.task;
}

export async function deleteTaskDefinition({ resourceId }: Pick<ResourceDestroyerParams, "resourceId">): Promise<void> {
  const client = getClient();
  const command = new DeregisterTaskDefinitionCommand({ taskDefinition: resourceId });
  await client.send(command);
}
