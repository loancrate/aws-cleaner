import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RateLimiter } from "./RateLimiter.js";

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

/** Returns the fake time elapsed by each successive wait. */
async function waits(limiter: RateLimiter, count: number): Promise<number[]> {
  const result = [];
  for (let i = 0; i < count; i++) {
    const start = Date.now();
    await limiter.wait();
    result.push(Date.now() - start);
  }
  return result;
}

test("allows a burst of maxTokens, then one call per refill interval", async () => {
  const limiter = new RateLimiter({ windowMs: 1000, maxTokens: 3, fillRate: 2 });
  expect(await waits(limiter, 5)).toEqual([0, 0, 0, 500, 500]);
});

test("refills no more than maxTokens while idle", async () => {
  const limiter = new RateLimiter({ windowMs: 1000, maxTokens: 2 });
  await waits(limiter, 2);
  vi.advanceTimersByTime(10_000);
  expect(await waits(limiter, 3)).toEqual([0, 0, 1000]);
});

test("starts with initialTokens", async () => {
  const limiter = new RateLimiter({ windowMs: 1000, maxTokens: 5, initialTokens: 0 });
  expect(await waits(limiter, 2)).toEqual([1000, 1000]);
});

test("empty() discards available tokens", async () => {
  const limiter = new RateLimiter({ windowMs: 1000, maxTokens: 5 });
  limiter.empty();
  expect(await waits(limiter, 1)).toEqual([1000]);
});
