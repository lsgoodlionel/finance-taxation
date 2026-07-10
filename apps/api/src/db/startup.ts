type RetryDbStartupOptions = {
  maxAttempts?: number;
  delayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  beforeRetry?: (context: {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    error: Error;
  }) => Promise<void> | void;
};

const RETRYABLE_DB_STARTUP_PATTERNS = [
  "Connection terminated due to connection timeout",
  "ECONNREFUSED",
  "ENOTFOUND",
  "timeout expired",
  "the database system is starting up"
];

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function isRetryableDbStartupError(error: unknown): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }

  return RETRYABLE_DB_STARTUP_PATTERNS.some((pattern) => error.message.includes(pattern));
}

export async function retryDbStartup<T>(
  operation: () => Promise<T>,
  options: RetryDbStartupOptions = {}
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 12);
  const delayMs = Math.max(0, options.delayMs ?? 2_000);
  const sleep = options.sleep ?? defaultSleep;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableDbStartupError(error)) {
        throw error;
      }

      lastError = error;
      if (attempt >= maxAttempts) {
        break;
      }

      await options.beforeRetry?.({
        attempt,
        maxAttempts,
        delayMs,
        error
      });
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error("Database startup retry failed without an error");
}
