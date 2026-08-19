/**
 * Parsed contract event. `topics` contains the raw topic strings; `data`
 * contains the decoded body (e.g., { credential_id, subject_id, ... }).
 */
export interface ContractEvent {
  network: string;
  contractId: string;
  ledger: number;
  eventIndex: number;
  eventType: string;
  topics: string[];
  data: Record<string, unknown>;
  txHash: string | null;
}

export interface IndexedEvent {
  network: string;
  contractId: string;
  ledger: number;
  eventIndex: number;
  eventType: string;
  entityId: string | null;
  credentialId: string | null;
  subjectId: string | null;
  issuerId: string | null;
  eventEntityId: string | null;
  data: Record<string, unknown>;
}

/**
 * Ingest, deduplicate and project contract events. The indexer is
 * intentionally separate from the gateway: it is read-only on-chain and
 * idempotent when processing the same ledger/event twice.
 */
export interface StellarIndexer {
  /** Save raw events if (network, contract, ledger, index) is new. */
  ingest(events: ContractEvent[]): Promise<{ inserted: number; deduplicated: number }>;
  /** Process all unprocessed raw events into the derived index. */
  processUnprocessed(network: string, contractId: string): Promise<number>;
  /** Last seen ledger for (network, contract). */
  getCursor(network: string, contractId: string): Promise<number | null>;
  setCursor(network: string, contractId: string, ledger: number): Promise<void>;
  /** Rebuild the projection table(s) from indexed events. */
  rebuildProjections(): Promise<void>;
}
