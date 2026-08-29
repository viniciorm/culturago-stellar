import 'server-only';
import { PoolClient } from 'pg';
import { OperationPhase } from '../../ports/StellarGateway';
import { OperationStore, StoredOperation } from '../../ports/OperationStore';
import { query, translatePgError, withTransaction } from '../database/pool';

const ALL_OPERATION_PHASES: OperationPhase[] = [
  'awaiting_signature',
  'signed',
  'submitted',
  'confirming',
  'confirmed',
  'failed_retryable',
  'failed_terminal',
  'unknown',
  'restoring',
];

interface StellarOperationsRow {
  id: string;
  idempotency_key: string;
  operation_type: string;
  payload: unknown;
  phase: string;
  tx_hash: string | null;
  ledger: number | null;
  error_code: string | null;
  attempt_count: number;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string;
}

function fromRow(row: StellarOperationsRow): StoredOperation {
  const payload = row.payload as Record<string, unknown>;
  const prepared = payload.prepared as StoredOperation['intent']['prepared'] | null | undefined;
  const signed = payload.signed as StoredOperation['intent']['signed'] | null | undefined;
  return {
    state: {
      operationId: row.id,
      idempotencyKey: row.idempotency_key,
      phase: row.phase as StoredOperation['state']['phase'],
      txHash: row.tx_hash ?? null,
      ledger: row.ledger ?? null,
      errorCode: row.error_code ?? null,
    },
    intent: {
      kind: row.operation_type as StoredOperation['intent']['kind'],
      actorAddress: (payload.actorAddress as string) ?? '',
      fingerprint: (payload.fingerprint as string) ?? '',
      subjectKey: (payload.subjectKey as string) ?? '',
      prepared: prepared === undefined ? null : prepared,
      signed: signed === undefined ? null : signed,
      expected: (payload.expected as StoredOperation['intent']['expected']) ?? undefined,
    },
    attemptCount: row.attempt_count ?? 0,
    nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : null,
  };
}

function toPayload(record: StoredOperation): unknown {
  return {
    actorAddress: record.intent.actorAddress,
    fingerprint: record.intent.fingerprint,
    subjectKey: record.intent.subjectKey,
    prepared: record.intent.prepared,
    signed: record.intent.signed,
    expected: record.intent.expected,
  };
}

/**
 * Durable PostgreSQL outbox for chain operations. The row lives in
 * `stellar_operations`; `claimBatch` uses `FOR UPDATE SKIP LOCKED` so
 * multiple workers grab disjoint batches in one atomic step.
 */
export class PostgreSQLOperationStore implements OperationStore {
  async findByIdempotencyKey(idempotencyKey: string): Promise<StoredOperation | null> {
    const result = await query<StellarOperationsRow>(
      'SELECT * FROM stellar_operations WHERE idempotency_key = $1',
      [idempotencyKey]
    ).catch(translatePgError);
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async get(operationId: string): Promise<StoredOperation | null> {
    const result = await query<StellarOperationsRow>(
      'SELECT * FROM stellar_operations WHERE id = $1',
      [operationId]
    ).catch(translatePgError);
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async create(record: StoredOperation): Promise<void> {
    await query(
      `INSERT INTO stellar_operations (
        id, idempotency_key, operation_type, payload, phase, subject_key,
        intent_fingerprint, prepared_xdr, tx_hash, ledger, error_code,
        attempt_count, next_retry_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        record.state.operationId,
        record.state.idempotencyKey,
        record.intent.kind,
        toPayload(record),
        record.state.phase,
        record.intent.subjectKey,
        record.intent.fingerprint,
        record.intent.prepared?.unsignedXdr ?? null,
        record.state.txHash,
        record.state.ledger,
        record.state.errorCode,
        0,
        null,
      ]
    ).catch(translatePgError);
  }

  async save(record: StoredOperation): Promise<void> {
    await query(
      `UPDATE stellar_operations SET
        phase = $2,
        payload = $3,
        subject_key = $4,
        intent_fingerprint = $5,
        prepared_xdr = $6,
        signed_xdr = $7,
        signer_address = $8,
        tx_hash = $9,
        ledger = $10,
        error_code = $11,
        attempt_count = $12,
        next_retry_at = $13,
        claimed_until = NULL,
        claimed_by = NULL
      WHERE id = $1`,
      [
        record.state.operationId,
        record.state.phase,
        toPayload(record),
        record.intent.subjectKey,
        record.intent.fingerprint,
        record.intent.prepared?.unsignedXdr ?? null,
        record.intent.signed?.signedXdr ?? null,
        record.intent.signed?.signerAddress ?? null,
        record.state.txHash,
        record.state.ledger,
        record.state.errorCode,
        record.attemptCount ?? 0,
        record.nextRetryAt ?? null,
      ]
    ).catch(translatePgError);
  }

  async claimBatch(options: {
    batchSize: number;
    workerId: string;
    ttlSeconds: number;
    maxAttempts?: number;
  }): Promise<StoredOperation[]> {
    return withTransaction(async (client: PoolClient) => {
      const until = new Date(Date.now() + options.ttlSeconds * 1000);
      const maxAttempts = options.maxAttempts ?? 10;
      const result = await client.query<StellarOperationsRow>(
        `UPDATE stellar_operations
         SET claimed_by = $1,
             claimed_until = $2,
             updated_at = NOW()
         WHERE id IN (
           SELECT id
           FROM stellar_operations
           WHERE phase IN ('signed','submitted','confirming','failed_retryable','unknown','restoring')
             AND (next_retry_at IS NULL OR next_retry_at <= NOW())
             AND (claimed_until IS NULL OR claimed_until <= NOW())
             AND attempt_count < LEAST($4, max_attempts)
           ORDER BY created_at
           FOR UPDATE SKIP LOCKED
           LIMIT $3
         )
         RETURNING *`,
        [options.workerId, until, options.batchSize, maxAttempts]
      );
      return result.rows.map(fromRow);
    }).catch((error) => {
      translatePgError(error);
      throw error;
    });
  }

  async countByPhase(): Promise<Record<OperationPhase, number>> {
    const counts = Object.fromEntries(
      ALL_OPERATION_PHASES.map((phase) => [phase, 0])
    ) as Record<OperationPhase, number>;
    const result = await query<{ phase: string; count: string }>(
      'SELECT phase, COUNT(*)::text as count FROM stellar_operations GROUP BY phase'
    ).catch(translatePgError);
    for (const row of result.rows) {
      if (row.phase in counts) {
        counts[row.phase as OperationPhase] = Number(row.count);
      }
    }
    return counts;
  }
}
