import { AppError } from "@/server/errors";

/**
 * Sliding-window rate limiter. In-memory by default (single-instance dev);
 * swap in the Redis driver in production (RATE_LIMIT_DRIVER).
 */
interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

const MAX_ENTRIES = 10_000;

function prune(now: number) {
  if (windows.size < MAX_ENTRIES) return;
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key);
  }
}

export function assertWithinRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || entry.resetAt <= now) {
    prune(now);
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  entry.count += 1;
  if (entry.count > limit) {
    const retryMinutes = Math.ceil((entry.resetAt - now) / 60_000);
    throw new AppError(
      "RATE_LIMITED",
      `Too many attempts. Please try again in ${retryMinutes} minute${retryMinutes === 1 ? "" : "s"}.`,
    );
  }
}

/** Test hook: reset all windows. */
export function __resetRateLimits(): void {
  windows.clear();
}
