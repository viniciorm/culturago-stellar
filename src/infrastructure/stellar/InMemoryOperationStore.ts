import { domainError } from '../../domain/errors';
import { OperationStore, StoredOperation } from '../../ports/OperationStore';

/** In-memory store for demo/tests. Not for production reconciliation. */
export class InMemoryOperationStore implements OperationStore {
  private byId = new Map<string, StoredOperation>();
  private byIdempotencyKey = new Map<string, string>();
  private claims = new Map<string, { workerId: string; until: number }>();
  private actionable = new Set<string>([
    'signed',
    'submitted',
    'confirming',
    'failed_retryable',
    'unknown',
    'restoring',
  ]);

  async findByIdempotencyKey(idempotencyKey: string): Promise<StoredOperation | null> {
    const id = this.byIdempotencyKey.get(idempotencyKey);
    return id ? this.byId.get(id) ?? null : null;
  }

  async get(operationId: string): Promise<StoredOperation | null> {
    return this.byId.get(operationId) ?? null;
  }

  async create(record: StoredOperation): Promise<void> {
    if (this.byIdempotencyKey.has(record.state.idempotencyKey)) {
      throw domainError(
        'ALREADY_EXISTS',
        `idempotency key ${record.state.idempotencyKey} already bound to an operation`
      );
    }
    this.byId.set(record.state.operationId, record);
    this.byIdempotencyKey.set(record.state.idempotencyKey, record.state.operationId);
  }

  async save(record: StoredOperation): Promise<void> {
    if (!this.byId.has(record.state.operationId)) {
      throw domainError('NOT_FOUND', `operation ${record.state.operationId} does not exist`);
    }
    this.byId.set(record.state.operationId, record);
  }

  async claimBatch(options: {
    batchSize: number;
    workerId: string;
    ttlSeconds: number;
  }): Promise<StoredOperation[]> {
    const now = Date.now();
    const results: StoredOperation[] = [];
    for (const [, record] of this.byId) {
      if (!this.actionable.has(record.state.phase)) continue;
      const claim = this.claims.get(record.state.operationId);
      if (claim && claim.until > now) continue;
      this.claims.set(record.state.operationId, {
        workerId: options.workerId,
        until: now + options.ttlSeconds * 1000,
      });
      results.push(record);
      if (results.length >= options.batchSize) break;
    }
    return results;
  }
}
