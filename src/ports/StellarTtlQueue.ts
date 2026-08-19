/**
 * Entry whose lifetime must be extended on-chain before eviction.
 */
export interface TtlEntry {
  network: string;
  contractId: string;
  entryKey: string;
  entryKind: 'contract_data' | 'contract_code' | 'instance';
  expiresAtLedger: number | null;
  lastExtendedLedger: number | null;
  status: 'pending' | 'alerted' | 'extended' | 'failed';
  alertSentAt: Date | null;
  nextRunAt: Date;
}

export interface StellarTtlQueue {
  /** Register or update a TTL entry. */
  upsert(entry: Omit<TtlEntry, 'nextRunAt' | 'status' | 'alertSentAt'>): Promise<void>;
  /** Claim due entries; same semantics as OperationStore.claimBatch. */
  claimDue(options: { batchSize: number; workerId: string; ttlSeconds: number }): Promise<TtlEntry[]>;
  /** Mark the entry as successfully extended or failed. */
  markResult(
    entry: Pick<TtlEntry, 'network' | 'contractId' | 'entryKey'>,
    status: 'extended' | 'failed',
    lastExtendedLedger: number | null
  ): Promise<void>;
  /** Entries that are below a safe ledger threshold and need attention. */
  getAtRisk(beforeLedger: number): Promise<TtlEntry[]>;
}
