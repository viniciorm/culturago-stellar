import 'server-only';
import { domainError } from '@/domain/errors';
import { type RateBudgetStore, type HitResult } from '@/ports/RateBudgetStore';
import { query } from './pool';

/**
 * PostgreSQL-backed rate/budget store shared across processes and instances.
 * Uses an UPSERT that resets the window when it has expired and otherwise
 * increments the counter. The caller decides whether count > limit.
 */
export class PostgreSQLRateBudgetStore implements RateBudgetStore {
  async hitLimit(
    key: string,
    windowType: 'rate' | 'budget',
    limit: number,
    windowMs: number
  ): Promise<HitResult> {
    const now = Date.now();
    const resetAt = now + windowMs;
    const result = await query<{ count: number; reset_at: number }>(
      `INSERT INTO rate_budget_windows (actor_id, window_type, count, reset_at)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (actor_id, window_type) DO UPDATE
       SET count = CASE
         WHEN rate_budget_windows.reset_at <= $4 THEN 1
         WHEN rate_budget_windows.count >= $5 THEN rate_budget_windows.count
         ELSE rate_budget_windows.count + 1
       END,
       reset_at = CASE
         WHEN rate_budget_windows.reset_at <= $4 THEN $3
         ELSE rate_budget_windows.reset_at
       END
       RETURNING count, reset_at`,
      [key, windowType, resetAt, now, limit]
    );

    const row = result.rows[0];
    if (!row) {
      throw domainError('INTERNAL', 'RateBudgetStore returned no row');
    }
    return { count: row.count, resetAt: row.reset_at };
  }
}
