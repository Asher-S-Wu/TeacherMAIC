export async function runConcurrentQueue<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  shouldContinue: () => boolean = () => true,
): Promise<void> {
  if (items.length === 0) return;

  let nextIndex = 0;
  let hasError = false;
  let firstError: unknown;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (!hasError && shouldContinue()) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        try {
          await worker(items[index], index);
        } catch (error) {
          if (!hasError) {
            hasError = true;
            firstError = error;
          }
          return;
        }
      }
    }),
  );

  if (hasError) {
    throw firstError;
  }
}
