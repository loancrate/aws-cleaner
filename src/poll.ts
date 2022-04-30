export type AsyncPredicate = () => Promise<boolean>;

export type Poller = (predicate: AsyncPredicate) => Promise<void>;

export async function pollPredicate(predicate: AsyncPredicate, intervalMs = 10000): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      if (await predicate()) {
        resolve();
      } else {
        const interval = setInterval(async () => {
          try {
            if (await predicate()) {
              clearInterval(interval);
              resolve();
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
}
