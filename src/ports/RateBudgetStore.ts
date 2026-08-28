export interface HitResult {
  count: number;
  resetAt: number;
}

/**
 * Durable or shared rate/budget store. Each (key, windowType) pair defines
 * a sliding window counter. Implementations must be safe for concurrent use.
 */
export interface RateBudgetStore {
  /**
   * Record one hit for the given actor and window type, then return the
   * resulting count and reset timestamp. The caller is responsible for
   * throwing when `count > limit`.
   */
  hitLimit(key: string, windowType: 'rate' | 'budget', limit: number, windowMs: number): Promise<HitResult>;
}
