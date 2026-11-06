import { expect, test } from "vitest";
import { isResourceType, ResourceType } from "./ResourceType.js";
import { resourceTypeDependencies } from "./ResourceTypeDependencies.js";

const graph = resourceTypeDependencies as Record<string, ResourceType[]>;

test("only references known resource types", () => {
  for (const deps of Object.values(graph)) {
    for (const dep of deps) {
      expect(isResourceType(dep), dep).toBe(true);
    }
  }
});

test("has no self-dependencies", () => {
  for (const [type, deps] of Object.entries(graph)) {
    expect(deps, type).not.toContain(type);
  }
});

test("is acyclic", () => {
  const done = new Set<string>();
  const visit = (type: string, path: string[]): void => {
    if (path.includes(type)) {
      throw new Error(`Cycle: ${[...path, type].join(" -> ")}`);
    }
    if (done.has(type)) {
      return;
    }
    for (const dep of graph[type]) {
      visit(dep, [...path, type]);
    }
    done.add(type);
  };
  for (const type of Object.keys(graph)) {
    visit(type, []);
  }
});

test("isResourceType rejects unknown types", () => {
  expect(isResourceType("ec2.instance")).toBe(true);
  expect(isResourceType("ec2.unknown")).toBe(false);
});
