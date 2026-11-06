import { expect, test } from "vitest";
import { CategoryDependencies, SchedulerBuilder, SchedulerOptions, TaskParams } from "./scheduler.js";

type TaskSpec = [name: string, params?: TaskParams, fail?: boolean];

/** Runs each task to completion in order, recording the order the tasks start. */
async function run(deps: CategoryDependencies, tasks: TaskSpec[], options?: SchedulerOptions): Promise<string[]> {
  const started: string[] = [];
  const builder = new SchedulerBuilder(deps);
  for (const [name, params, fail] of tasks) {
    builder.addTask(async () => {
      started.push(name);
      await Promise.resolve();
      if (fail) {
        throw new Error(name);
      }
    }, params);
  }
  await builder.build().execute(options);
  return started;
}

test("runs tasks in insertion order by default", async () => {
  expect(await run({}, [["a"], ["b"], ["c"]])).toEqual(["a", "b", "c"]);
});

test("orders tasks within a group by sort key", async () => {
  const tasks: TaskSpec[] = [
    ["c", { sortKey: "c" }],
    ["a", { sortKey: "a" }],
    ["b", { sortKey: "b" }],
  ];
  expect(await run({}, tasks)).toEqual(["a", "b", "c"]);
});

test("runs a category only after the categories that depend on it", async () => {
  const deps = { instance: ["subnet"], subnet: ["vpc"], vpc: [] };
  const tasks: TaskSpec[] = [
    ["vpc", { category: "vpc" }],
    ["subnet", { category: "subnet" }],
    ["instance", { category: "instance" }],
  ];
  expect(await run(deps, tasks)).toEqual(["instance", "subnet", "vpc"]);
});

test("follows transitive dependencies through absent categories", async () => {
  const deps = { instance: ["subnet"], subnet: ["vpc"], vpc: [] };
  const tasks: TaskSpec[] = [
    ["vpc", { category: "vpc" }],
    ["instance", { category: "instance" }],
  ];
  expect(await run(deps, tasks)).toEqual(["instance", "vpc"]);
});

test("does not order dependencies across partitions", async () => {
  const deps = { instance: ["vpc"], vpc: [] };
  const tasks: TaskSpec[] = [
    ["pr-1 instance", { partitionKey: "pr-1", category: "instance" }],
    ["pr-2 vpc", { partitionKey: "pr-2", category: "vpc" }],
    ["pr-1 vpc", { partitionKey: "pr-1", category: "vpc" }],
  ];
  expect(await run(deps, tasks)).toEqual(["pr-1 instance", "pr-2 vpc", "pr-1 vpc"]);
});

test("starts groups in natural partition order", async () => {
  const tasks: TaskSpec[] = [
    ["pr-10", { partitionKey: "pr-10" }],
    ["pr-9", { partitionKey: "pr-9" }],
  ];
  expect(await run({}, tasks)).toEqual(["pr-9", "pr-10"]);
});

test("stops starting tasks after an error", async () => {
  const deps = { instance: ["vpc"], vpc: [] };
  const tasks: TaskSpec[] = [
    ["instance", { category: "instance" }, true],
    ["vpc", { category: "vpc" }],
  ];
  expect(await run(deps, tasks)).toEqual(["instance"]);
});

test("runs remaining tasks after an error with continueAfterErrors", async () => {
  const deps = { instance: ["vpc"], vpc: [] };
  const tasks: TaskSpec[] = [
    ["instance", { category: "instance" }, true],
    ["vpc", { category: "vpc" }],
  ];
  expect(await run(deps, tasks, { continueAfterErrors: true })).toEqual(["instance", "vpc"]);
});

test("limits concurrency", async () => {
  let running = 0;
  let peak = 0;
  const builder = new SchedulerBuilder();
  for (let i = 0; i < 10; i++) {
    builder.addTask(async () => {
      peak = Math.max(peak, ++running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      --running;
    });
  }
  await builder.build().execute({ maximumConcurrency: 3 });
  expect(peak).toBe(3);
});
