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
        // find any existing groups from dependent categories
        const depGroups = transitiveCategories.reduce<ExecutionGroup[]>((acc, depCat) => {
          const depKey = makeGroupKey(partitionKey, depCat);
          const group = executionGroups.get(depKey);
          if (group) {
            acc.push(group);
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
            `Added to dependent groups`,
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
      (a, b) => compareNumericString(a.partitionKey || "", b.partitionKey || "") || compare(a.category, b.category),
    );
    logger.debug(
      { initialGroups: initialGroups.map((g) => makeGroupKey(g.partitionKey, g.category)) },
      "Built initial groups",
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
  private readonly runningTasks: Promise<unknown>[] = [];
  private aborting = false;

  public constructor(private readonly runnableGroups: ExecutionGroup[]) {}

  public async execute(options: SchedulerOptions = {}) {
    for (;;) {
      // start all currently runnable groups
      let group: ExecutionGroup | undefined;
      while (!this.aborting && (group = this.runnableGroups.shift())) {
        await this.startGroup(group, options);
      }

      if (this.aborting || !this.runningTasks.length) break;

      // each time a task completes, check for new runnable groups
      await Promise.race(this.runningTasks);
    }

    // in case of abort, just wait for already running tasks
    await Promise.allSettled(this.runningTasks);
  }

  private async startGroup(
    group: ExecutionGroup,
    { maximumConcurrency = 20, continueAfterErrors = false }: SchedulerOptions,
  ): Promise<void> {
    const { partitionKey, category, pendingTasks } = group;
    const groupKey = makeGroupKey(partitionKey, category);
    for (const task of pendingTasks) {
      group.runningTaskCount = (group.runningTaskCount || 0) + 1;
      const runningTask = task()
        .catch(() => {
          if (!continueAfterErrors) this.aborting = true;
        })
        .finally(() => {
          if (--group.runningTaskCount! === 0 && !this.aborting) {
            this.notifyGroupCompletion(group, groupKey);
          }
          deleteArrayElement(this.runningTasks, runningTask);
        });
      this.runningTasks.push(runningTask);

      if (this.runningTasks.length >= maximumConcurrency) {
        await Promise.race(this.runningTasks);
        if (this.aborting) break;
      }
    }
  }

  private notifyGroupCompletion(group: ExecutionGroup, groupKey: string): void {
    if (group.notifyGroups) {
      for (const notifyGroup of group.notifyGroups) {
        const notifyGroupKey = makeGroupKey(notifyGroup.partitionKey, notifyGroup.category);
        let msg = `Notifying ${notifyGroupKey} of ${groupKey} completion`;
        if (
          notifyGroup.waitingOnGroupKeys &&
          deleteArrayElement(notifyGroup.waitingOnGroupKeys, groupKey) &&
          notifyGroup.waitingOnGroupKeys.length === 0
        ) {
          this.runnableGroups.push(notifyGroup);
          msg += " and queuing it for execution";
        }
        logger.debug(msg);
      }
    }
  }
}

function deleteArrayElement<T>(arr: T[], element: T): boolean {
  const index = arr.indexOf(element);
  if (index >= 0) {
    arr.splice(index, 1);
    return true;
  }
  return false;
}
