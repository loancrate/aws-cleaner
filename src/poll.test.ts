import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getPoller } from "./poll.js";

// Sleeping just advances the fake clock.
vi.mock("timers/promises", () => ({
  setTimeout: (ms: number) => Promise.resolve(vi.setSystemTime(Date.now() + ms)),
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

const poll = getPoller({ intervalMs: 1000, timeoutMs: 2500 });

test("checks immediately, then once per interval until the predicate passes", async () => {
  const predicate = vi.fn((durationMs: number) => Promise.resolve(durationMs >= 2000));
  await poll(predicate, { description: "test" });
  expect(predicate.mock.calls.map(([durationMs]) => durationMs)).toEqual([0, 1000, 2000]);
});

test("throws once the timeout is exceeded", async () => {
  const predicate = vi.fn<(durationMs: number) => Promise<boolean>>(() => Promise.resolve(false));
  await expect(poll(predicate)).rejects.toThrow("Timeout exceeded");
  expect(predicate.mock.calls.map(([durationMs]) => durationMs)).toEqual([0, 1000, 2000, 3000]);
});

test("has no timeout when timeoutMs is null", async () => {
  const predicate = vi.fn((durationMs: number) => Promise.resolve(durationMs >= 60 * 60_000));
  await getPoller({ intervalMs: 60_000, timeoutMs: null })(predicate);
  expect(predicate).toHaveBeenCalledTimes(61);
});
