import { domainError } from '../../domain/errors';
import { StellarTtlQueue, TtlEntry } from '../../ports/StellarTtlQueue';

/**
 * In-memory TTL queue for local demos/tests. Mirrors the contract entry
 * lifetimes so restore jobs can be exercised without a live ledger.
 */
export class InMemoryTtlQueue implements StellarTtlQueue {
  private entries = new Map<string, TtlEntry>();
  private claims = new Map<string, { workerId: string; until: number }>();

  private key(e: Pick<TtlEntry, 'network' | 'contractId' | 'entryKey'>): string {
    return `${e.network}:${e.contractId}:${e.entryKey}`;
  }

  async upsert(entry: Omit<TtlEntry, 'nextRunAt' | 'status' | 'alertSentAt'>): Promise<void> {
    const existing = this.entries.get(this.key(entry));
    this.entries.set(this.key(entry), {
      ...entry,
      status: existing?.status ?? 'pending',
      alertSentAt: existing?.alertSentAt ?? null,
      nextRunAt: existing?.nextRunAt ?? new Date(Date.now()),
    });
  }

  async claimDue(options: {
    batchSize: number;
    workerId: string;
    ttlSeconds: number;
  }): Promise<TtlEntry[]> {
    const now = Date.now();
    const until = new Date(now + options.ttlSeconds * 1000);
    const result: TtlEntry[] = [];
    for (const [k, entry] of this.entries) {
      if (entry.status !== 'pending' && entry.status !== 'alerted') continue;
      if (entry.nextRunAt.getTime() > now) continue;
      const claim = this.claims.get(k);
      if (claim && claim.until > now) continue;
      this.claims.set(k, { workerId: options.workerId, until: until.getTime() });
      result.push({ ...entry, nextRunAt: until });
      if (result.length >= options.batchSize) break;
    }
    return result;
  }

  async markResult(
    id: Pick<TtlEntry, 'network' | 'contractId' | 'entryKey'>,
    status: 'extended' | 'failed',
    lastExtendedLedger: number | null
  ): Promise<void> {
    const entry = this.entries.get(this.key(id));
    if (!entry) throw domainError('NOT_FOUND', `TTL entry ${this.key(id)} not found`);
    entry.status = status;
    entry.lastExtendedLedger = lastExtendedLedger;
    entry.nextRunAt = new Date(Date.now() + 60_000);
    this.claims.delete(this.key(id));
  }

  async getAtRisk(beforeLedger: number): Promise<TtlEntry[]> {
    return [...this.entries.values()].filter(
      (e) => e.expiresAtLedger !== null && e.expiresAtLedger <= beforeLedger
    );
  }
}
