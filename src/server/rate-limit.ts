import "server-only";

/*
 * Fixed-window rate limit kept in memory: enough for one server instance. Swap for a shared
 * store (e.g. Redis) when the site runs on more than one.
 */
const windows = new Map<string, { start: number; count: number }>();

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = windows.get(key);
  if (!current || now - current.start > windowMs) {
    windows.set(key, { start: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}
