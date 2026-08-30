import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PostgreSQLOperationStore } from '@/infrastructure/stellar/PostgreSQLOperationStore';
import { createMockStellarGateway } from '@/infrastructure/stellar/MockStellarGateway';
import { StellarWorker } from '@/infrastructure/stellar/StellarWorker';
import { closePool, query } from '@/infrastructure/database/pool';
import { isPersistenceConfigured } from '@/infrastructure/config/env';
import type { OperationStore, StoredOperation } from '@/ports/OperationStore';

const ACTOR = 'G_DEMO_ACTOR';
const hex = (byte: number) => byte.toString(16).padStart(2, '0').repeat(32);

function signedOperation(
  store: OperationStore,
  subjectKey: string,
  signedXdr: string
): Promise<StoredOperation> {
  const id = randomUUID();
  const idempotencyKey = `key-pg-${Math.random().toString(36).slice(2)}`;
  const record: StoredOperation = {
    state: {
      operationId: id,
      idempotencyKey,
      phase: 'signed',
      txHash: null,
      ledger: null,
      errorCode: null,
    },
    attemptCount: 0,
    nextRetryAt: null,
    intent: {
      kind: 'register_entity',
      actorAddress: ACTOR,
      fingerprint: hex(9),
      subjectKey,
      prepared: {
        operationId: id,
        networkPassphrase: 'CulturaGO Demo ; 2026',
        unsignedXdr: signedXdr,
        preparedAtLedger: 1000,
        intentFingerprint: hex(9),
      },
      signed: {
        operationId: id,
        signedXdr,
        signerAddress: ACTOR,
      },
      expected: { metadataHash: hex(9), hashSchema: 1 },
    },
  };
  return store.create(record).then(() => record);
}

const describeIfPg = isPersistenceConfigured() ? describe : describe.skip;

describeIfPg('StellarWorker with PostgreSQLOperationStore', () => {
  let store: PostgreSQLOperationStore;

  beforeAll(async () => {
    store = new PostgreSQLOperationStore();
    await query("DELETE FROM stellar_operations WHERE idempotency_key LIKE 'key-pg-%'");
  });

  afterAll(async () => {
    await query("DELETE FROM stellar_operations WHERE idempotency_key LIKE 'key-pg-%'");
    await closePool();
  });

  it('resubmits a signed payload and updates phase to confirmed', async () => {
    const bundle = createMockStellarGateway({ signer: null, store });
    const prepared = JSON.stringify({
      v: 1,
      mode: 'unsigned',
      signature: null,
      spec: {
        method: 'register_entity',
        args: [
          { kind: 'address', address: ACTOR },
          { kind: 'bytes32', hex: hex(1) },
          { kind: 'bytes32', hex: hex(9) },
          { kind: 'u32', value: 1 },
        ],
      },
    });
    const envelope = JSON.parse(prepared) as Record<string, unknown>;
    envelope.mode = 'signed';
    envelope.signature = 'demo-sig';
    const signedXdr = JSON.stringify(envelope);

    const op = await signedOperation(store, hex(1), signedXdr);

    const worker = new StellarWorker(store, bundle.gateway, {
      batchSize: 10,
      workerId: 'pg-worker-1',
      claimTtlSeconds: 10,
      pollIntervalMs: 100,
      maxAttempts: 5,
    });

    const processed = await worker.runOneBatch();
    expect(processed).toBe(1);

    const final = await store.get(op.state.operationId);
    expect(final?.state.phase).toBe('confirmed');

    const counts = await store.countByPhase();
    expect(counts.confirmed).toBeGreaterThanOrEqual(1);
  });

  it('two workers do not claim the same operation', async () => {
    const bundle = createMockStellarGateway({ signer: null, store });
    const prepared = JSON.stringify({
      v: 1,
      mode: 'unsigned',
      signature: null,
      spec: { method: 'register_entity', args: [] },
    });
    const envelope = JSON.parse(prepared) as Record<string, unknown>;
    envelope.mode = 'signed';
    envelope.signature = 'demo-sig';
    const signedXdr = JSON.stringify(envelope);
    await signedOperation(store, hex(1), signedXdr);

    const workerA = new StellarWorker(store, bundle.gateway, {
      batchSize: 10,
      workerId: 'pg-worker-A',
      claimTtlSeconds: 10,
      pollIntervalMs: 100,
      maxAttempts: 5,
    });
    const workerB = new StellarWorker(store, bundle.gateway, {
      batchSize: 10,
      workerId: 'pg-worker-B',
      claimTtlSeconds: 10,
      pollIntervalMs: 100,
      maxAttempts: 5,
    });

    const [a, b] = await Promise.all([workerA.runOneBatch(), workerB.runOneBatch()]);
    expect(a + b).toBe(1);
  });
});
