import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Cache, CacheConfiguration } from "./cache.js";

const minute = 60_000;
const config: CacheConfiguration = {
  disabled: false,
  workspacesTtlMs: 15 * minute,
  pullRequestsTtlMs: 15 * minute,
  resourcesTtlMs: 15 * minute,
  roleTagsTtlMs: 24 * 60 * minute,
};
const pullRequests = { openPRs: [1, 2], lastPR: 3 };

let tmpdir: string;
const cacheFile = () => path.join(tmpdir, "aws-cleaner.json");

beforeEach(async () => {
  tmpdir = await mkdtemp(path.join(os.tmpdir(), "aws-cleaner-test-"));
  vi.spyOn(os, "tmpdir").mockReturnValue(tmpdir);
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await rm(tmpdir, { recursive: true });
});

test("returns entries until their TTL elapses", () => {
  const cache = new Cache(config);
  cache.setPullRequests(pullRequests);

  vi.advanceTimersByTime(15 * minute);
  expect(cache.getPullRequests()).toEqual(pullRequests);

  vi.advanceTimersByTime(1);
  expect(cache.getPullRequests()).toBeUndefined();
});

test("keeps role tags for their full TTL", () => {
  vi.setSystemTime(new Date(2026, 0, 1, 23, 0));
  const cache = new Cache(config);
  cache.setRoleTags("arn:role", [{ Key: "env", Value: "pr-1" }]);

  vi.advanceTimersByTime(23 * 60 * minute);
  expect(cache.getRoleTags("arn:role")).toEqual([{ Key: "env", Value: "pr-1" }]);
});

test("removes individual deleted items", () => {
  const cache = new Cache(config);
  cache.setActiveTaskDefinitionFamilies(["a", "b"]);
  cache.deleteActiveTaskDefinitionFamily("a");
  expect(cache.getActiveTaskDefinitionFamilies()).toEqual(["b"]);
});

test("deleting a role also deletes its tags", () => {
  const cache = new Cache(config);
  cache.setRoles([{ Arn: "arn:role", RoleName: "role", Path: "/", RoleId: "id", CreateDate: new Date() }]);
  cache.setRoleTags("arn:role", [{ Key: "env", Value: "pr-1" }]);

  cache.deleteRole("arn:role");

  expect(cache.getRoles()).toEqual([]);
  expect(cache.getRoleTags("arn:role")).toBeUndefined();
});

test("saves and reloads entries", async () => {
  const saved = new Cache(config);
  saved.setPullRequests(pullRequests);
  await saved.save();

  const loaded = new Cache(config);
  await loaded.load();
  expect(loaded.getPullRequests()).toEqual(pullRequests);
});

test("drops expired entries on save", async () => {
  const cache = new Cache(config);
  cache.setPullRequests(pullRequests);
  cache.setInstances([]);
  vi.advanceTimersByTime(16 * minute);
  await cache.save();

  expect(JSON.parse(await readFile(cacheFile(), "utf8"))).toEqual({ version: 1 });
});

test.each([
  ["a different version", JSON.stringify({ version: 0, pullRequests, pullRequestsDate: new Date().toISOString() })],
  ["invalid JSON", "{"],
])("ignores a cache file with %s", async (_, contents) => {
  await writeFile(cacheFile(), contents);
  const cache = new Cache(config);
  await cache.load();
  expect(cache.getPullRequests()).toBeUndefined();
});

test("neither loads nor saves when disabled", async () => {
  const cache = new Cache({ ...config, disabled: true });
  cache.setPullRequests(pullRequests);
  await cache.save();
  await expect(readFile(cacheFile())).rejects.toThrow("ENOENT");
});
