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
    return new Promise(async (resolve, reject) => {
      const startTime = Date.now();
      try {
        if (await predicate(0)) {
          resolve();
        } else {
          const interval = setInterval(async () => {
            const durationMs = Date.now() - startTime;
            if (description) {
              logger.debug(`Waiting ${formatDuration(durationMs)} for ${description}`);
            }
            try {
              if (await predicate(durationMs)) {
                clearInterval(interval);
                resolve();
              } else if (timeoutMs != null && durationMs > timeoutMs) {
                clearInterval(interval);
                reject(new Error(`Timeout exceeded`));
              }
            } catch (err) {
              clearInterval(interval);
              reject(err);
            }
          }, intervalMs);
        }
      } catch (err) {
        reject(err);
      }
    });
  };
}

function formatDuration(ms: number): string {
  let seconds = Math.round(ms / 1000);
  if (seconds >= 60) {
    let minutes = Math.floor(seconds / 60);
    seconds %= 60;
    if (minutes >= 60) {
      let hours = Math.floor(minutes / 60);
      minutes %= 60;
      return `${hours}h${minutes}m${seconds}s`;
    }
    return `${minutes}m${seconds}s`;
  }
  return `${seconds}s`;
}
