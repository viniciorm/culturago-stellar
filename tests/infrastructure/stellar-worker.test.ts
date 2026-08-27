import { describe, expect, it } from 'vitest';
import { InMemoryIndexer } from '@/infrastructure/stellar/InMemoryIndexer';
import { InMemoryTtlQueue } from '@/infrastructure/stellar/InMemoryTtlQueue';
import { createMockStellarGateway, MockSigner } from '@/infrastructure/stellar/MockStellarGateway';
import { StellarWorker } from '@/infrastructure/stellar/StellarWorker';
import { OperationStore, StoredOperation } from '@/ports/OperationStore';

const ACTOR = 'G_DEMO_ACTOR';
const hex = (byte: number) => byte.toString(16).padStart(2, '0').repeat(32);

function validRegisterSpec(entityId: string, metadataHash: string, hashSchema: number) {
  return JSON.stringify({
    v: 1,
    mode: 'unsigned',
    signature: null,
    spec: {
      method: 'register_entity',
      args: [
        { kind: 'address', address: ACTOR },
        { kind: 'bytes32', hex: entityId },
        { kind: 'bytes32', hex: metadataHash },
        { kind: 'u32', value: hashSchema },
      ],
    },
  });
}

function pendingOperation(
  store: OperationStore,
  kind: StoredOperation['intent']['kind'],
  subjectKey: string,
  unsignedXdr: string,
  expected?: StoredOperation['intent']['expected']
): Promise<StoredOperation> {
  const id = `op-${Math.random().toString(36).slice(2)}`;
  const record: StoredOperation = {
    state: {
      operationId: id,
      idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
      phase: 'awaiting_signature',
      txHash: null,
      ledger: null,
      errorCode: null,
    },
    intent: {
      kind,
      actorAddress: ACTOR,
      fingerprint: hex(9),
      subjectKey,
      prepared: {
        operationId: id,
        networkPassphrase: 'CulturaGO Demo ; 2026',
        unsignedXdr,
        preparedAtLedger: 1000,
        intentFingerprint: hex(9),
      },
      expected,
    },
  };
  return store.create(record).then(() => record);
}

function pendingReconcile(
  store: OperationStore,
  txHash: string,
  subjectKey: string
): Promise<StoredOperation> {
  const id = `op-${Math.random().toString(36).slice(2)}`;
  const record: StoredOperation = {
    state: {
      operationId: id,
      idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
      phase: 'unknown',
      txHash,
      ledger: null,
      errorCode: null,
    },
    intent: {
      kind: 'register_entity',
      actorAddress: ACTOR,
      fingerprint: hex(9),
      subjectKey,
      prepared: null,
    },
  };
  return store.create(record).then(() => record);
}

describe('StellarWorker', () => {
  it('processes an awaiting_signature operation to confirmed', async () => {
    const bundle = createMockStellarGateway({ signer: null });
    const store = bundle.store;
    const gateway = bundle.gateway;
    const op = await pendingOperation(
      store,
      'register_entity',
      hex(1),
      validRegisterSpec(hex(1), hex(9), 1),
      { metadataHash: hex(9), hashSchema: 1 }
    );

    const worker = new StellarWorker(store, gateway, new MockSigner(ACTOR), {
      batchSize: 10,
      workerId: 'w1',
      claimTtlSeconds: 10,
      pollIntervalMs: 100,
      maxAttempts: 5,
    });

    const count = await worker.runOneBatch();
    expect(count).toBe(1);

    const final = await store.get(op.state.operationId);
    expect(final?.state.phase).toBe('confirmed');
    expect(final?.state.ledger).not.toBeNull();
  });

  it('reconciles an unknown operation', async () => {
    const bundle = createMockStellarGateway({ signer: null });
    const store = bundle.store;
    const gateway = bundle.gateway;
    // The mock chain doesn't have this tx hash, so the reconciler should
    // converge to unknown (which is still the only safe non-dup answer).
    const op = await pendingReconcile(store, 'missing-tx-hash', hex(1));

    const worker = new StellarWorker(store, gateway, null, {
      batchSize: 10,
      workerId: 'w2',
      claimTtlSeconds: 10,
      pollIntervalMs: 100,
      maxAttempts: 5,
    });

    await worker.runOneBatch();
    const final = await store.get(op.state.operationId);
    expect(final?.state.phase).toBe('unknown');
  });

  it('two workers do not claim the same operation', async () => {
    const bundle = createMockStellarGateway({ signer: null });
    const store = bundle.store;
    const gateway = bundle.gateway;
    const prepared = `{"v":1,"mode":"unsigned","signature":null,"spec":{"method":"register_entity","args":[]}}`;
    await pendingOperation(store, 'register_entity', hex(1), prepared);

    const workerA = new StellarWorker(store, gateway, new MockSigner(ACTOR), {
      batchSize: 10,
      workerId: 'A',
      claimTtlSeconds: 10,
      pollIntervalMs: 100,
      maxAttempts: 5,
    });
    const workerB = new StellarWorker(store, gateway, null, {
      batchSize: 10,
      workerId: 'B',
      claimTtlSeconds: 10,
      pollIntervalMs: 100,
      maxAttempts: 5,
    });

    const [a, b] = await Promise.all([workerA.runOneBatch(), workerB.runOneBatch()]);
    // One of them got the operation, the other an empty batch.
    expect(a + b).toBe(1);
  });
});

describe('InMemoryIndexer', () => {
  it('deduplicates identical (network, contract, ledger, index) events', async () => {
    const indexer = new InMemoryIndexer();
    const event = {
      network: 'testnet',
      contractId: 'CENTITY',
      ledger: 1234,
      eventIndex: 0,
      eventType: 'CredentialIssued',
      topics: ['CredentialIssued'],
      data: { credential_id: hex(1), subject_id: hex(2), event_id: hex(3) },
      txHash: 'tx1',
    };
    const result = await indexer.ingest([event, event, event]);
    expect(result.inserted).toBe(1);
    expect(result.deduplicated).toBe(2);
  });

  it('rebuilds the subject/event passport projection', async () => {
    const indexer = new InMemoryIndexer();
    await indexer.ingest([
      {
        network: 'testnet',
        contractId: 'CCRED',
        ledger: 100,
        eventIndex: 0,
        eventType: 'CredentialIssued',
        topics: ['CredentialIssued'],
        data: { credential_id: hex(1), subject_id: hex(2), event_id: hex(3), issuer_id: hex(4) },
        txHash: 'tx-a',
      },
      {
        network: 'testnet',
        contractId: 'CCRED',
        ledger: 101,
        eventIndex: 0,
        eventType: 'CredentialRevoked',
        topics: ['CredentialRevoked'],
        data: { credential_id: hex(1), subject_id: hex(2), event_id: hex(3), issuer_id: hex(4) },
        txHash: 'tx-b',
      },
    ]);
    await indexer.processUnprocessed('testnet', 'CCRED');
    const passport = indexer.getPassport(hex(2), hex(3));
    expect(passport).toHaveLength(2);
    expect(passport[0].eventType).toBe('CredentialIssued');
    expect(passport[1].eventType).toBe('CredentialRevoked');

    await indexer.rebuildProjections();
    const rebuilt = indexer.getPassport(hex(2), hex(3));
    expect(rebuilt).toHaveLength(2);
  });

  it('persists and returns cursors', async () => {
    const indexer = new InMemoryIndexer();
    await indexer.setCursor('testnet', 'CENTITY', 1000);
    expect(await indexer.getCursor('testnet', 'CENTITY')).toBe(1000);
    expect(await indexer.getCursor('testnet', 'CCRED')).toBeNull();
  });
});

describe('InMemoryTtlQueue', () => {
  it('claims and resolves a due TTL job', async () => {
    const queue = new InMemoryTtlQueue();
    await queue.upsert({
      network: 'testnet',
      contractId: 'CCRED',
      entryKey: 'instance',
      entryKind: 'instance',
      expiresAtLedger: 1000,
      lastExtendedLedger: 500,
    });
    const claimed = await queue.claimDue({ batchSize: 5, workerId: 'ttl1', ttlSeconds: 10 });
    expect(claimed).toHaveLength(1);
    await queue.markResult(claimed[0], 'extended', 1100);
    const atRisk = await queue.getAtRisk(1050);
    expect(atRisk.map((e) => e.entryKey)).toContain('instance');
    expect(atRisk.find((e) => e.entryKey === 'instance')?.status).toBe('extended');
  });
});
