import { compare, compareNumericString, compareStringOrNumber } from "./compare.js";
import logger from "./logger.js";

export type Task = () => Promise<unknown>;

export interface TaskParams {
  partitionKey?: string;
  category?: string;
  sortKey?: string | number;
}

export type CategoryDependencies = Record<string, string[]>;

interface InputGroupTask {
  task: Task;
  sortKey: string | number;
}

interface InputGroup {
  partitionKey?: string;
  category?: string;
  tasks: InputGroupTask[];
}

interface ExecutionGroup {
  partitionKey?: string;
  category?: string;
  pendingTasks: Task[];
  runningTaskCount?: number;
  waitingOnGroupKeys?: string[];
  notifyGroups?: ExecutionGroup[];
}

export class SchedulerBuilder {
  private readonly inputGroups = new Map<string, InputGroup>();
  private taskCount = 0;

  public constructor(private readonly categoryDependencies: CategoryDependencies = {}) {}

  public addTask(task: Task, { partitionKey, category, sortKey }: TaskParams = {}) {
    ++this.taskCount;
    if (sortKey == null) sortKey = this.taskCount;
    const groupKey = makeGroupKey(partitionKey, category);
    let group = this.inputGroups.get(groupKey);
    if (group) {
      group.tasks.push({ task, sortKey });
    } else {
      this.inputGroups.set(groupKey, {
        partitionKey,
        category,
        tasks: [{ task, sortKey }],
      });
    }
  }

  public build(): Scheduler {
    const executionGroups = new Map<string, ExecutionGroup>();
    for (const [groupKey, group] of this.inputGroups.entries()) {
      const { partitionKey, category, tasks } = group;
      executionGroups.set(groupKey, {
        partitionKey,
        category,
        pendingTasks: tasks.sort((a, b) => compareStringOrNumber(a.sortKey, b.sortKey)).map((it) => it.task),
      });
    }

    for (const [groupKey, group] of executionGroups.entries()) {
      const { partitionKey, category } = group;
      const dependentCategories = category ? this.categoryDependencies[category] : [];
      if (dependentCategories.length > 0) {
        const transitiveCategories = getTransitiveClosure(this.categoryDependencies, dependentCategories);
        logger.debug({ groupKey, dependentCategories, transitiveCategories }, `Resolved transitive dependencies`);
        // find any existing groups from dependent categories
        const depGroups = transitiveCategories.reduce<ExecutionGroup[]>((acc, depCat) => {
          const depKey = makeGroupKey(partitionKey, depCat);
          const group = executionGroups.get(depKey);
          if (group) {
            acc.push(group);
          } else {
            logger.debug({ groupKey, depKey }, `No dependent group found`);
          }
          return acc;
        }, []);
        // if any dependent groups exist, wait on them and continue
        if (depGroups.length > 0) {
          for (const depGroup of depGroups) {
            (depGroup.waitingOnGroupKeys || (depGroup.waitingOnGroupKeys = [])).push(groupKey);
            (group.notifyGroups || (group.notifyGroups = [])).push(depGroup);
          }
          logger.debug(
            {
              groupKey,
              notifyGroups: group.notifyGroups?.map((g) => makeGroupKey(g.partitionKey, g.category)),
            },
            `Added to dependent groups`
          );
        }
      }
    }

    const initialGroups: ExecutionGroup[] = [];
    for (const group of executionGroups.values()) {
      if (!group.waitingOnGroupKeys?.length) {
        initialGroups.push(group);
      }
    }
    initialGroups.sort(
      (a, b) => compareNumericString(a.partitionKey || "", b.partitionKey || "") || compare(a.category, b.category)
    );
    logger.debug(
      { initialGroups: initialGroups.map((g) => makeGroupKey(g.partitionKey, g.category)) },
      "Built initial groups"
    );

    return new Scheduler(initialGroups);
  }
}

function makeGroupKey(partitionKey?: string, category?: string): string {
  return partitionKey && category ? `${partitionKey}:${category}` : partitionKey || category || "";
}

function getTransitiveClosure(graph: CategoryDependencies, start: string[]): string[] {
  const result = new Set(start);
  const searchQueue = start.slice();
  let search;
  while ((search = searchQueue.shift()) != null) {
    const deps = graph[search];
    if (deps?.length) {
      for (const dep of deps) {
        if (!result.has(dep)) {
          result.add(dep);
          searchQueue.push(dep);
        }
      }
    }
  }
  return Array.from(result);
}

export interface SchedulerOptions {
  maximumConcurrency?: number;
  continueAfterErrors?: boolean;
}

export class Scheduler {
  public constructor(private readonly runnableGroups: ExecutionGroup[]) {}

  public async execute({ maximumConcurrency = 20, continueAfterErrors = false }: SchedulerOptions = {}) {
    const runningTasks: Promise<unknown>[] = [];
    let aborting = false;
    let group: ExecutionGroup | undefined;
    while (!aborting && (group = this.runnableGroups.shift())) {
      const { partitionKey, category, pendingTasks } = group;
      const groupKey = makeGroupKey(partitionKey, category);
      for (const task of pendingTasks) {
        group.runningTaskCount = (group.runningTaskCount || 0) + 1;
        const taskGroup = group;
        const runningTask = task()
          .catch(() => {
            if (!continueAfterErrors) aborting = true;
          })
          .finally(() => {
            if (--taskGroup.runningTaskCount! && !aborting && taskGroup.notifyGroups) {
              for (const notifyGroup of taskGroup.notifyGroups) {
                if (notifyGroup.waitingOnGroupKeys) {
                  const index = notifyGroup.waitingOnGroupKeys.indexOf(groupKey);
                  if (index >= 0) {
                    notifyGroup.waitingOnGroupKeys.splice(index, 1);
                    if (notifyGroup.waitingOnGroupKeys.length === 0) {
                      this.runnableGroups.push(notifyGroup);
                    }
                  }
                }
              }
            }
            const index = runningTasks.indexOf(runningTask);
            runningTasks.splice(index, 1);
          });
        runningTasks.push(runningTask);
        if (runningTasks.length >= maximumConcurrency) {
          await Promise.race(runningTasks);
          if (aborting) break;
        }
      }
    }
    await Promise.allSettled(runningTasks);
  }
}
