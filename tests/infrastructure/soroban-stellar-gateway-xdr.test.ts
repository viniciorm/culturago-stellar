import { describe, expect, it, vi } from 'vitest';
import {
  Account,
  Address,
  Asset,
  Keypair,
  Memo,
  Operation,
  SorobanDataBuilder,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { randomBytes, randomUUID } from 'crypto';
import { domainError, isDomainError } from '@/domain/errors';
import { InMemoryOperationStore } from '@/infrastructure/stellar/InMemoryOperationStore';
import { SorobanStellarGateway } from '@/infrastructure/stellar/SorobanStellarGateway';
import type { OperationStore, StoredOperation } from '@/ports/OperationStore';
import type { SorobanTransport } from '@/ports/SorobanTransport';
import type { StellarNetworkConfig } from '@/infrastructure/stellar/networkConfig';
import type { PreparedTransactionPayload } from '@/ports/SignerPort';

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const ACTOR_CONTRACT = 'CBUUMXY77DF4QG5KY5H37SEV63HOLPIVEUZGP2UEQ4PGBNWC2JYFJQGO';
const OTHER_CONTRACT = 'CBQPZU6O2HTURYQBMYYZ3DDZBTT67AYCXMT5YUYOSVQU5PUCBW642RJ6';
const FIXTURE_SOURCE_ACCOUNT = Keypair.random().publicKey();

function randomContractId(): string {
  return Address.fromScAddress(xdr.ScAddress.scAddressTypeContract(randomBytes(32) as any)).toString();
}

function contractIdToScAddress(contractId: string): xdr.ScAddress {
  return Address.fromString(contractId).toScAddress();
}

function invokeContractArgs(contractId: string, method: string, args: xdr.ScVal[] = []): xdr.InvokeContractArgs {
  return new xdr.InvokeContractArgs({
    contractAddress: contractIdToScAddress(contractId),
    functionName: method,
    args,
  });
}

function hostFunctionInvokeContract(contractId: string, method: string, args: xdr.ScVal[] = []): xdr.HostFunction {
  return xdr.HostFunction.hostFunctionTypeInvokeContract(invokeContractArgs(contractId, method, args));
}

function authorizedInvocation(contractId: string, method: string, args: xdr.ScVal[] = []): xdr.SorobanAuthorizedInvocation {
  return new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      invokeContractArgs(contractId, method, args)
    ),
    subInvocations: [],
  });
}

function buildAuthEntry(
  contractId: string,
  signature: xdr.ScVal,
  signatureExpirationLedger = 1000,
  rootInvocation: xdr.SorobanAuthorizedInvocation
): xdr.SorobanAuthorizationEntry {
  const credentials = xdr.SorobanCredentials.sorobanCredentialsAddressV2(
    new xdr.SorobanAddressCredentials({
      address: contractIdToScAddress(contractId),
      nonce: xdr.Int64.fromString('0'),
      signatureExpirationLedger,
      signature,
    })
  );
  return new xdr.SorobanAuthorizationEntry({
    credentials,
    rootInvocation,
  });
}

interface BuildXdrOptions {
  sourceAccount?: string;
  sourceSequence?: string;
  contractId?: string;
  method?: string;
  args?: xdr.ScVal[];
  auth: xdr.SorobanAuthorizationEntry[];
  memo?: Memo;
  preconditions?: xdr.Preconditions;
  sorobanData?: xdr.SorobanTransactionData;
  extraOps?: xdr.Operation[];
}

function buildXdr(options: BuildXdrOptions): string {
  const sourceKey = options.sourceAccount ?? FIXTURE_SOURCE_ACCOUNT;
  const sequence = options.sourceSequence ?? '0';
  const contractId = options.contractId ?? ACTOR_CONTRACT;
  const method = options.method ?? 'register_entity';
  const args = options.args ?? [];

  const tb = new TransactionBuilder(new Account(sourceKey, sequence), {
    fee: '100',
    networkPassphrase: TESTNET_PASSPHRASE,
  }).setTimeout(0);

  if (options.memo) {
    tb.addMemo(options.memo);
  }

  tb.addOperation(
    (Operation.invokeHostFunction as (opts: any) => xdr.Operation)({
      func: hostFunctionInvokeContract(contractId, method, args),
      auth: options.auth,
      sorobanData: options.sorobanData ?? new SorobanDataBuilder().build(),
    })
  );

  for (const op of options.extraOps ?? []) {
    tb.addOperation(op);
  }

  return tb.build().toXDR();
}

function unsignedAuthEntry(contractId: string, rootInvocation: xdr.SorobanAuthorizedInvocation): xdr.SorobanAuthorizationEntry {
  return buildAuthEntry(contractId, xdr.ScVal.scvVoid(), 0, rootInvocation);
}

function signedAuthEntry(
  contractId: string,
  rootInvocation: xdr.SorobanAuthorizedInvocation,
  expiration = 1000
): xdr.SorobanAuthorizationEntry {
  return buildAuthEntry(
    contractId,
    xdr.ScVal.scvVec([xdr.ScVal.scvU32(1)]),
    expiration,
    rootInvocation
  );
}

function buildUnsignedXdr(actor: string, overrides: Partial<BuildXdrOptions> = {}): string {
  const rootInvocation = authorizedInvocation(overrides.contractId ?? ACTOR_CONTRACT, overrides.method ?? 'register_entity', overrides.args ?? []);
  const auth = overrides.auth ?? [unsignedAuthEntry(actor, rootInvocation)];
  return buildXdr({
    auth,
    ...overrides,
  });
}

function buildSignedXdr(actor: string, overrides: Partial<BuildXdrOptions> = {}): string {
  const rootInvocation = authorizedInvocation(overrides.contractId ?? ACTOR_CONTRACT, overrides.method ?? 'register_entity', overrides.args ?? []);
  const defaultAuth = [signedAuthEntry(actor, rootInvocation)];
  const auth = overrides.auth ?? defaultAuth;
  return buildXdr({
    auth,
    ...overrides,
  });
}

function buildConfig(feePayer: Keypair): StellarNetworkConfig {
  return {
    environment: 'testnet',
    networkPassphrase: TESTNET_PASSPHRASE,
    rpcUrl: 'https://soroban-testnet.stellar.org',
    entityRegistryContractId: ACTOR_CONTRACT,
    credentialRegistryContractId: OTHER_CONTRACT,
    explorerBase: null,
    smartWalletWasmAllowlist: [],
    feePayerAddress: feePayer.publicKey(),
    feePayerSecret: feePayer.secret(),
    maxFeeStrokes: 500_000,
    relayerDailyBudget: 500,
  };
}

function mockTransport(): SorobanTransport {
  return {
    simulate: vi.fn().mockRejectedValue(domainError('INTERNAL', 'simulate not expected in XDR tests')),
    submit: vi.fn().mockRejectedValue(domainError('INTERNAL', 'submit not expected in XDR tests')),
    pollTransaction: vi.fn().mockResolvedValue({ status: 'NOT_FOUND' }),
    readback: vi.fn().mockRejectedValue(domainError('INTERNAL', 'readback not expected in XDR tests')),
    verifySignedMatches: vi.fn().mockRejectedValue(domainError('INTERNAL', 'verifySignedMatches not expected in XDR tests')),
    enforcingSimulateAndAssemble: vi
      .fn()
      .mockRejectedValue(domainError('INTERNAL', 'REACHED_ENFORCING_SIMULATE')),
  };
}

async function createOperation(
  store: OperationStore,
  actor: string,
  unsignedXdr: string
): Promise<StoredOperation> {
  const operationId = randomUUID();
  const idempotencyKey = `xdr-test:${randomUUID()}`;
  const prepared: PreparedTransactionPayload = {
    operationId,
    networkPassphrase: TESTNET_PASSPHRASE,
    unsignedXdr,
    preparedAtLedger: 100,
    intentFingerprint: 'sha256-fake-fingerprint',
  };
  const record: StoredOperation = {
    state: {
      operationId,
      phase: 'awaiting_signature',
      idempotencyKey,
      txHash: null,
      ledger: null,
      errorCode: null,
    },
    intent: {
      kind: 'register_entity',
      actorAddress: actor,
      fingerprint: prepared.intentFingerprint,
      subjectKey: 'entity-test',
      prepared,
      signed: null,
    },
  };
  await store.create(record);
  return record;
}

describe('SorobanStellarGateway smart wallet XDR structural validation', () => {
  it('accepts a valid smart wallet signature and reaches enforcing simulation', async () => {
    const feePayer = Keypair.random();
    const store = new InMemoryOperationStore();
    const transport = mockTransport();
    const gateway = new SorobanStellarGateway(buildConfig(feePayer), transport, store, null);
    const actor = randomContractId();
    const unsignedXdr = buildUnsignedXdr(actor);
    const signedXdr = buildSignedXdr(actor);

    const op = await createOperation(store, actor, unsignedXdr);

    await expect(gateway.submitSigned(op.state.operationId, signedXdr, actor)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error, 'INTERNAL') && (error as Error).message.includes('REACHED_ENFORCING_SIMULATE')
    );

    expect(transport.enforcingSimulateAndAssemble).toHaveBeenCalledTimes(1);
    expect(transport.enforcingSimulateAndAssemble).toHaveBeenCalledWith(signedXdr);
  });

  it('rejects when the signed contract id differs', async () => {
    const feePayer = Keypair.random();
    const store = new InMemoryOperationStore();
    const transport = mockTransport();
    const gateway = new SorobanStellarGateway(buildConfig(feePayer), transport, store, null);
    const actor = randomContractId();
    const unsignedXdr = buildUnsignedXdr(actor);
    const otherContract = randomContractId();
    const signedXdr = buildSignedXdr(actor, { contractId: otherContract });

    const op = await createOperation(store, actor, unsignedXdr);

    await expect(gateway.submitSigned(op.state.operationId, signedXdr, actor)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error, 'UNAUTHORIZED') && (error as Error).message.includes('transaction body differs')
    );

    expect(transport.enforcingSimulateAndAssemble).not.toHaveBeenCalled();
  });

  it('rejects when the signed method name differs', async () => {
    const feePayer = Keypair.random();
    const store = new InMemoryOperationStore();
    const transport = mockTransport();
    const gateway = new SorobanStellarGateway(buildConfig(feePayer), transport, store, null);
    const actor = randomContractId();
    const unsignedXdr = buildUnsignedXdr(actor, { method: 'register_entity' });
    const signedXdr = buildSignedXdr(actor, { method: 'version_entity' });

    const op = await createOperation(store, actor, unsignedXdr);

    await expect(gateway.submitSigned(op.state.operationId, signedXdr, actor)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error, 'UNAUTHORIZED') && (error as Error).message.includes('transaction body differs')
    );

    expect(transport.enforcingSimulateAndAssemble).not.toHaveBeenCalled();
  });

  it('rejects when the signed argument changes', async () => {
    const feePayer = Keypair.random();
    const store = new InMemoryOperationStore();
    const transport = mockTransport();
    const gateway = new SorobanStellarGateway(buildConfig(feePayer), transport, store, null);
    const actor = randomContractId();
    const args: xdr.ScVal[] = [xdr.ScVal.scvU32(1)];
    const tamperedArgs: xdr.ScVal[] = [xdr.ScVal.scvU32(2)];
    const unsignedXdr = buildUnsignedXdr(actor, { args });
    const signedXdr = buildSignedXdr(actor, { args: tamperedArgs });

    const op = await createOperation(store, actor, unsignedXdr);

    await expect(gateway.submitSigned(op.state.operationId, signedXdr, actor)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error, 'UNAUTHORIZED') && (error as Error).message.includes('transaction body differs')
    );

    expect(transport.enforcingSimulateAndAssemble).not.toHaveBeenCalled();
  });

  it('rejects when the transaction source changes', async () => {
    const feePayer = Keypair.random();
    const store = new InMemoryOperationStore();
    const transport = mockTransport();
    const gateway = new SorobanStellarGateway(buildConfig(feePayer), transport, store, null);
    const actor = randomContractId();
    const unsignedXdr = buildUnsignedXdr(actor);
    const signedXdr = buildSignedXdr(actor, { sourceAccount: Keypair.random().publicKey() });

    const op = await createOperation(store, actor, unsignedXdr);

    await expect(gateway.submitSigned(op.state.operationId, signedXdr, actor)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error, 'UNAUTHORIZED') && (error as Error).message.includes('transaction body differs')
    );

    expect(transport.enforcingSimulateAndAssemble).not.toHaveBeenCalled();
  });

  it('rejects when the transaction sequence number changes', async () => {
    const feePayer = Keypair.random();
    const store = new InMemoryOperationStore();
    const transport = mockTransport();
    const gateway = new SorobanStellarGateway(buildConfig(feePayer), transport, store, null);
    const actor = randomContractId();
    const unsignedXdr = buildUnsignedXdr(actor);
    const signedXdr = buildSignedXdr(actor, { sourceSequence: '5' });

    const op = await createOperation(store, actor, unsignedXdr);

    await expect(gateway.submitSigned(op.state.operationId, signedXdr, actor)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error, 'UNAUTHORIZED') && (error as Error).message.includes('transaction body differs')
    );

    expect(transport.enforcingSimulateAndAssemble).not.toHaveBeenCalled();
  });

  it('rejects when a memo is added to the signed transaction', async () => {
    const feePayer = Keypair.random();
    const store = new InMemoryOperationStore();
    const transport = mockTransport();
    const gateway = new SorobanStellarGateway(buildConfig(feePayer), transport, store, null);
    const actor = randomContractId();
    const unsignedXdr = buildUnsignedXdr(actor);
    const signedXdr = buildSignedXdr(actor, { memo: Memo.text('not-allowed') });

    const op = await createOperation(store, actor, unsignedXdr);

    await expect(gateway.submitSigned(op.state.operationId, signedXdr, actor)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error, 'UNAUTHORIZED') && (error as Error).message.includes('transaction body differs')
    );

    expect(transport.enforcingSimulateAndAssemble).not.toHaveBeenCalled();
  });

  it('rejects when the signed transaction has an extra operation', async () => {
    const feePayer = Keypair.random();
    const store = new InMemoryOperationStore();
    const transport = mockTransport();
    const gateway = new SorobanStellarGateway(buildConfig(feePayer), transport, store, null);
    const actor = randomContractId();
    const unsignedXdr = buildUnsignedXdr(actor);
    const extraOp = (Operation.invokeHostFunction as (opts: any) => xdr.Operation)({
      func: hostFunctionInvokeContract(OTHER_CONTRACT, 'noop', []),
      auth: [],
      sorobanData: new SorobanDataBuilder().build(),
    });
    const signedXdr = buildSignedXdr(actor, { extraOps: [extraOp] });

    const op = await createOperation(store, actor, unsignedXdr);

    await expect(gateway.submitSigned(op.state.operationId, signedXdr, actor)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error, 'INVALID_INPUT') && (error as Error).message.includes('exactly one operation')
    );

    expect(transport.enforcingSimulateAndAssemble).not.toHaveBeenCalled();
  });

  it('rejects when the auth address is from another wallet', async () => {
    const feePayer = Keypair.random();
    const store = new InMemoryOperationStore();
    const transport = mockTransport();
    const gateway = new SorobanStellarGateway(buildConfig(feePayer), transport, store, null);
    const actor = randomContractId();
    const other = randomContractId();
    const unsignedXdr = buildUnsignedXdr(actor);
    const signedXdr = buildSignedXdr(other);

    const op = await createOperation(store, actor, unsignedXdr);

    await expect(gateway.submitSigned(op.state.operationId, signedXdr, actor)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error, 'UNAUTHORIZED') &&
        ((error as Error).message.includes('address changed') || (error as Error).message.includes('not match the intent actor'))
    );

    expect(transport.enforcingSimulateAndAssemble).not.toHaveBeenCalled();
  });

  it('rejects when the actor auth entry is not signed', async () => {
    const feePayer = Keypair.random();
    const store = new InMemoryOperationStore();
    const transport = mockTransport();
    const gateway = new SorobanStellarGateway(buildConfig(feePayer), transport, store, null);
    const actor = randomContractId();
    const unsignedXdr = buildUnsignedXdr(actor);
    const signedXdr = buildUnsignedXdr(actor); // unsigned payload submitted as signed

    const op = await createOperation(store, actor, unsignedXdr);

    await expect(gateway.submitSigned(op.state.operationId, signedXdr, actor)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error, 'UNAUTHORIZED') && (error as Error).message.includes('not signed')
    );

    expect(transport.enforcingSimulateAndAssemble).not.toHaveBeenCalled();
  });

  it('rejects when a non-actor auth entry is modified', async () => {
    const feePayer = Keypair.random();
    const store = new InMemoryOperationStore();
    const transport = mockTransport();
    const gateway = new SorobanStellarGateway(buildConfig(feePayer), transport, store, null);
    const actor = randomContractId();
    const other = randomContractId();

    const unsignedRoot = authorizedInvocation(ACTOR_CONTRACT, 'register_entity');
    const unsignedAuth = [
      unsignedAuthEntry(actor, unsignedRoot),
      unsignedAuthEntry(other, unsignedRoot),
    ];
    const unsignedXdr = buildUnsignedXdr(actor, { auth: unsignedAuth });

    const signedRoot = authorizedInvocation(ACTOR_CONTRACT, 'register_entity');
    const signedAuth = [
      signedAuthEntry(actor, signedRoot),
      signedAuthEntry(other, signedRoot, 9999), // changed expiration on non-actor auth
    ];
    const signedXdr = buildSignedXdr(actor, { auth: signedAuth });

    const op = await createOperation(store, actor, unsignedXdr);

    await expect(gateway.submitSigned(op.state.operationId, signedXdr, actor)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error, 'UNAUTHORIZED') && (error as Error).message.includes('Non-actor auth entry')
    );

    expect(transport.enforcingSimulateAndAssemble).not.toHaveBeenCalled();
  });

  it('rejects when the signer address does not match the intent actor', async () => {
    const feePayer = Keypair.random();
    const store = new InMemoryOperationStore();
    const transport = mockTransport();
    const gateway = new SorobanStellarGateway(buildConfig(feePayer), transport, store, null);
    const actor = randomContractId();
    const other = randomContractId();
    const unsignedXdr = buildUnsignedXdr(actor);
    const signedXdr = buildSignedXdr(actor);

    const op = await createOperation(store, actor, unsignedXdr);

    await expect(gateway.submitSigned(op.state.operationId, signedXdr, other)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error, 'UNAUTHORIZED') && (error as Error).message.includes('does not match the intent actor')
    );

    expect(transport.enforcingSimulateAndAssemble).not.toHaveBeenCalled();
  });

  it('rejects when the actor auth entry is not address-bound', async () => {
    const feePayer = Keypair.random();
    const store = new InMemoryOperationStore();
    const transport = mockTransport();
    const gateway = new SorobanStellarGateway(buildConfig(feePayer), transport, store, null);
    const actor = randomContractId();
    const unsignedXdr = buildUnsignedXdr(actor);

    // Build a signed XDR with a sorobanCredentialsAddress (v1) auth entry for the actor
    const rootInvocation = authorizedInvocation(ACTOR_CONTRACT, 'register_entity');
    const v1Creds = xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: contractIdToScAddress(actor),
        nonce: xdr.Int64.fromString('0'),
        signatureExpirationLedger: 1000,
        signature: xdr.ScVal.scvVec([xdr.ScVal.scvU32(1)]),
      })
    );
    const auth = [new xdr.SorobanAuthorizationEntry({ credentials: v1Creds, rootInvocation })];
    const signedXdr = buildXdr({ auth });

    const op = await createOperation(store, actor, unsignedXdr);

    await expect(gateway.submitSigned(op.state.operationId, signedXdr, actor)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error, 'UNAUTHORIZED') && (error as Error).message.includes('not address-bound')
    );

    expect(transport.enforcingSimulateAndAssemble).not.toHaveBeenCalled();
  });

  it('rejects when the signed payload is not a contract invocation', async () => {
    const feePayer = Keypair.random();
    const store = new InMemoryOperationStore();
    const transport = mockTransport();
    const gateway = new SorobanStellarGateway(buildConfig(feePayer), transport, store, null);
    const actor = randomContractId();
    const unsignedXdr = buildUnsignedXdr(actor);

    const tb = new TransactionBuilder(new Account(Keypair.random().publicKey(), '0'), {
      fee: '100',
      networkPassphrase: TESTNET_PASSPHRASE,
    }).setTimeout(0).addOperation(Operation.changeTrust({ asset: new Asset('USD', Keypair.random().publicKey()), limit: '100' })).build();

    const signedXdr = tb.toXDR();

    const op = await createOperation(store, actor, unsignedXdr);

    await expect(gateway.submitSigned(op.state.operationId, signedXdr, actor)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error, 'INVALID_INPUT') && (error as Error).message.includes('not a contract invocation')
    );

    expect(transport.enforcingSimulateAndAssemble).not.toHaveBeenCalled();
  });

  it('rejects when enforcing simulation reports an expired auth signature', async () => {
    const feePayer = Keypair.random();
    const store = new InMemoryOperationStore();
    const transport = mockTransport();
    const gateway = new SorobanStellarGateway(buildConfig(feePayer), transport, store, null);
    const actor = randomContractId();
    const rootInvocation = authorizedInvocation(ACTOR_CONTRACT, 'register_entity');
    const unsignedXdr = buildUnsignedXdr(actor, {
      auth: [unsignedAuthEntry(actor, rootInvocation)],
    });
    const signedXdr = buildSignedXdr(actor, {
      auth: [signedAuthEntry(actor, rootInvocation, 0)],
    });

    (transport as any).enforcingSimulateAndAssemble = vi.fn().mockResolvedValue({
      preparedXdr: '',
      needsRestore: false,
      latestLedger: 100,
      contractError: 'expired auth',
    });

    const op = await createOperation(store, actor, unsignedXdr);

    await expect(gateway.submitSigned(op.state.operationId, signedXdr, actor)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error, 'UNAUTHORIZED') && (error as Error).message.includes('expired auth')
    );

    expect(transport.enforcingSimulateAndAssemble).toHaveBeenCalledTimes(1);
  });

  it('rejects when enforcing simulation RPC is unavailable', async () => {
    const feePayer = Keypair.random();
    const store = new InMemoryOperationStore();
    const transport = mockTransport();
    const gateway = new SorobanStellarGateway(buildConfig(feePayer), transport, store, null);
    const actor = randomContractId();
    const unsignedXdr = buildUnsignedXdr(actor);
    const signedXdr = buildSignedXdr(actor);

    (transport as any).enforcingSimulateAndAssemble = vi.fn().mockRejectedValue(
      domainError('INVALID_INPUT', 'enforcing simulation request failed: RPC unavailable')
    );

    const op = await createOperation(store, actor, unsignedXdr);

    await expect(gateway.submitSigned(op.state.operationId, signedXdr, actor)).rejects.toSatisfy(
      (error: unknown) =>
        isDomainError(error, 'INVALID_INPUT') && (error as Error).message.includes('enforcing simulation request failed')
    );

    expect(transport.enforcingSimulateAndAssemble).toHaveBeenCalledTimes(1);
  });
});
