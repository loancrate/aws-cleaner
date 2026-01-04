import { setTimeout as sleep } from "timers/promises";
import logger from "./logger.js";

export type AsyncPredicate = (durationMs: number) => Promise<boolean>;

export interface PollerOptions {
  description?: string;
}

export type Poller = (predicate: AsyncPredicate, options?: PollerOptions) => Promise<void>;

export interface PollerFactoryOptions {
  intervalMs: number;
  timeoutMs?: number | null;
}

const defaultOptions: PollerFactoryOptions = {
  intervalMs: 5 * 1000,
  timeoutMs: 10 * 60 * 1000,
};

export function getPoller(options?: PollerFactoryOptions): Poller {
  const { intervalMs, timeoutMs } = { ...defaultOptions, ...options };
  return async function poll(predicate: AsyncPredicate, options?: PollerOptions): Promise<void> {
    const description = options?.description;
    const startTime = Date.now();

    if (await predicate(0)) {
      return;
    }

    for (;;) {
      await sleep(intervalMs);

      const durationMs = Date.now() - startTime;

      if (description) {
        logger.debug(`Waited ${formatDuration(durationMs)} for ${description}`);
      }

      if (await predicate(durationMs)) {
        return;
      }

      if (timeoutMs != null && durationMs > timeoutMs) {
        throw new Error("Timeout exceeded");
      }
    }
  };
}

function formatDuration(ms: number): string {
  let seconds = Math.round(ms / 1000);
  if (seconds >= 60) {
    let minutes = Math.floor(seconds / 60);
    seconds %= 60;
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      minutes %= 60;
      return `${hours}h${minutes}m${seconds}s`;
    }
    return `${minutes}m${seconds}s`;
  }
  return `${seconds}s`;
}
