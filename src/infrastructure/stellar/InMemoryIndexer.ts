import {
  ContractEvent,
  IndexedEvent,
  StellarIndexer,
} from '../../ports/StellarIndexer';

/**
 * In-memory indexer for tests and local demo. Deduplicates by
 * (network, contract, ledger, eventIndex) and can rebuild its projection
 * at any time — proving that the read model is a pure function of the
 * events it has seen.
 */
export class InMemoryIndexer implements StellarIndexer {
  private raw = new Map<string, ContractEvent>();
  private indexed = new Map<string, IndexedEvent>();
  private cursors = new Map<string, number>();
  private projections = new Map<string, IndexedEvent[]>();

  async ingest(events: ContractEvent[]): Promise<{ inserted: number; deduplicated: number }> {
    let inserted = 0;
    let deduplicated = 0;
    for (const event of events) {
      const key = `${event.network}:${event.contractId}:${event.ledger}:${event.eventIndex}`;
      if (this.raw.has(key)) {
        deduplicated++;
        continue;
      }
      this.raw.set(key, event);
      inserted++;
    }
    return { inserted, deduplicated };
  }

  async processUnprocessed(network: string, contractId: string): Promise<number> {
    const processed: IndexedEvent[] = [];
    for (const event of this.raw.values()) {
      if (event.network !== network || event.contractId !== contractId) continue;
      const key = `${network}:${contractId}:${event.ledger}:${event.eventIndex}`;
      if (this.indexed.has(key)) continue;
      const indexed: IndexedEvent = {
        network: event.network,
        contractId: event.contractId,
        ledger: event.ledger,
        eventIndex: event.eventIndex,
        eventType: event.eventType,
        entityId: (event.data.entity_id as string | undefined) ?? null,
        credentialId: (event.data.credential_id as string | undefined) ?? null,
        subjectId: (event.data.subject_id as string | undefined) ?? null,
        issuerId: (event.data.issuer_id as string | undefined) ?? null,
        eventEntityId: (event.data.event_id as string | undefined) ?? null,
        data: event.data,
      };
      this.indexed.set(key, indexed);
      processed.push(indexed);
    }

    for (const event of processed) {
      const projectionKey = `${event.subjectId ?? '*'}|${event.eventEntityId ?? '*'}`;
      const list = this.projections.get(projectionKey) ?? [];
      list.push(event);
      this.projections.set(projectionKey, list);
    }
    return processed.length;
  }

  async getCursor(network: string, contractId: string): Promise<number | null> {
    return this.cursors.get(`${network}:${contractId}`) ?? null;
  }

  async setCursor(network: string, contractId: string, ledger: number): Promise<void> {
    this.cursors.set(`${network}:${contractId}`, ledger);
  }

  async rebuildProjections(): Promise<void> {
    this.projections.clear();
    for (const event of this.indexed.values()) {
      const key = `${event.subjectId ?? '*'}|${event.eventEntityId ?? '*'}`;
      const list = this.projections.get(key) ?? [];
      list.push(event);
      this.projections.set(key, list);
    }
  }

  /** Test/readback helper: subject/event passport. */
  getPassport(subjectId: string, eventId: string): IndexedEvent[] {
    return this.projections.get(`${subjectId}|${eventId}`) ?? [];
  }
}
