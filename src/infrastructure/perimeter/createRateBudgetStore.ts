import { type RateBudgetStore } from '@/ports/RateBudgetStore';
import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { InMemoryRateBudgetStore } from './InMemoryRateBudgetStore';
import { PostgreSQLRateBudgetStore } from '@/infrastructure/database/PostgreSQLRateBudgetStore';

let store: RateBudgetStore | null = null;

/**
 * Returns the shared RateBudgetStore. Uses PostgreSQL when persistence is
 * configured, otherwise a per-process in-memory store. The store is cached
 * at the module level because it is stateless regarding callers.
 */
export function getRateBudgetStore(): RateBudgetStore {
  if (!store) {
    store = isPersistenceConfigured() ? new PostgreSQLRateBudgetStore() : new InMemoryRateBudgetStore();
  }
  return store;
}
