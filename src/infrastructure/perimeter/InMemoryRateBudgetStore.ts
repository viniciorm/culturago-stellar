import { type RateBudgetStore, type HitResult } from '@/ports/RateBudgetStore';

interface LimitEntry {
  count: number;
  resetAt: number;
}

/**
 * In-memory implementation for demo mode or environments without PostgreSQL.
 * It is safe for concurrent requests within the same process, but counts do
 * not survive restarts and are not shared across instances.
 */
export class InMemoryRateBudgetStore implements RateBudgetStore {
  private store = new Map<string, LimitEntry>();

  async hitLimit(
    key: string,
    windowType: 'rate' | 'budget',
    _limit: number,
    windowMs: number
  ): Promise<HitResult> {
    const now = Date.now();
    const fullKey = `${key}:${windowType}`;
    const entry = this.store.get(fullKey);

    if (!entry || now >= entry.resetAt) {
      const next = { count: 1, resetAt: now + windowMs };
      this.store.set(fullKey, next);
      return next;
    }

    entry.count += 1;
    return { count: entry.count, resetAt: entry.resetAt };
  }
}
