import { describe, expect, it, vi } from 'vitest';
import {
  Account,
  Address,
  Keypair,
  Operation,
  SorobanDataBuilder,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { PasskeyKitSigner } from '@/lib/smartWallet/PasskeyKitSigner';
import type { PreparedTransactionPayload } from '@/ports/SignerPort';

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const RPC_URL = 'https://soroban-testnet.stellar.org';
const WASM_HASH = '76f229bf36817460e7eff531e8cc8b7967d3d419365edc2d8bd630298443a941';

function buildUnsignedXdr(contractId: string): string {
  const source = Keypair.random().publicKey();
  const rootInvocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: Address.fromString(contractId).toScAddress(),
        functionName: 'register_entity',
        args: [],
      })
    ),
    subInvocations: [],
  });
  const authEntry = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddressV2(
      new xdr.SorobanAddressCredentials({
        address: Address.fromString(contractId).toScAddress(),
        nonce: xdr.Int64.fromString('0'),
        signatureExpirationLedger: 0,
        signature: xdr.ScVal.scvVoid(),
      })
    ),
    rootInvocation,
  });
  return new TransactionBuilder(new Account(source, '0'), {
    fee: '100',
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .setTimeout(0)
    .addOperation(
      (Operation.invokeHostFunction as (opts: any) => xdr.Operation)({
        func: xdr.HostFunction.hostFunctionTypeInvokeContract(
          new xdr.InvokeContractArgs({
            contractAddress: Address.fromString(contractId).toScAddress(),
            functionName: 'register_entity',
            args: [],
          })
        ),
        auth: [authEntry],
        sorobanData: new SorobanDataBuilder().build(),
      } as any)
    )
    .build()
    .toXDR();
}

function signedAuthEntry(contractId: string, expiration = 1000): xdr.SorobanAuthorizationEntry {
  const rootInvocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: Address.fromString(contractId).toScAddress(),
        functionName: 'register_entity',
        args: [],
      })
    ),
    subInvocations: [],
  });
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddressV2(
      new xdr.SorobanAddressCredentials({
        address: Address.fromString(contractId).toScAddress(),
        nonce: xdr.Int64.fromString('0'),
        signatureExpirationLedger: expiration,
        signature: xdr.ScVal.scvVec([xdr.ScVal.scvU32(1)]),
      })
    ),
    rootInvocation,
  });
}

const contractId = 'CBUUMXY77DF4QG5KY5H37SEV63HOLPIVEUZGP2UEQ4PGBNWC2JYFJQGO';

const mockFns = vi.hoisted(() => ({
  rpc: { getHealth: vi.fn() },
  connectWallet: vi.fn(),
  signAuthEntry: vi.fn(),
}));

vi.mock('passkey-kit', () => ({
  PasskeyKit: function (this: unknown) {
    const self = this as Record<string, unknown>;
    self.wallet = undefined;
    self.rpc = mockFns.rpc;
    self.connectWallet = mockFns.connectWallet;
    self.signAuthEntry = mockFns.signAuthEntry;
  },
}));

vi.mock('passkey-kit/storage', () => ({
  IndexedDBStorage: class MockIndexedDBStorage {
    constructor() {}
    async save() {}
    async get() {
      return null;
    }
    async getByContract() {
      return [];
    }
    async getAll() {
      return [];
    }
    async delete() {}
    async update() {}
    async clear() {}
  },
}));

describe('PasskeyKitSigner client-side signing', () => {
  it('connects a wallet and returns the contract address', async () => {
    const signer = new PasskeyKitSigner(RPC_URL, TESTNET_PASSPHRASE, WASM_HASH);
    mockFns.connectWallet.mockResolvedValue({ keyIdBase64: 'key-1', contractId });

    const result = await signer.connectWallet(undefined, contractId);

    expect(result).toBe(contractId);
  });

  it('throws when signing for the wrong network', async () => {
    const signer = new PasskeyKitSigner(RPC_URL, 'Wrong Passphrase', WASM_HASH);
    await signer.connectWallet(undefined, contractId);

    const prepared: PreparedTransactionPayload = {
      operationId: 'op-1',
      unsignedXdr: buildUnsignedXdr(contractId),
      networkPassphrase: TESTNET_PASSPHRASE,
      preparedAtLedger: 100,
      intentFingerprint: 'sha256-fake',
    };

    await expect(signer.sign(prepared)).rejects.toSatisfy((error: unknown) =>
      error instanceof Error && (error as Error).message.includes('different network')
    );
  });

  it('signs the auth entry and returns a different XDR with current ledger expiration', async () => {
    const signer = new PasskeyKitSigner(RPC_URL, TESTNET_PASSPHRASE, WASM_HASH);
    mockFns.connectWallet.mockResolvedValue({ keyIdBase64: 'key-1', contractId });
    mockFns.rpc.getHealth.mockResolvedValue({ latestLedger: 150 });
    mockFns.signAuthEntry.mockImplementation(async () => {
      return signedAuthEntry(contractId, 250);
    });

    await signer.connectWallet(undefined, contractId);

    const prepared: PreparedTransactionPayload = {
      operationId: 'op-1',
      unsignedXdr: buildUnsignedXdr(contractId),
      networkPassphrase: TESTNET_PASSPHRASE,
      preparedAtLedger: 100,
      intentFingerprint: 'sha256-fake',
    };

    const result = await signer.sign(prepared);

    expect(result.signerAddress).toBe(contractId);
    expect(result.signedXdr).not.toBe(prepared.unsignedXdr);
    expect(typeof result.signedXdr).toBe('string');
    expect(mockFns.rpc.getHealth).toHaveBeenCalled();
    expect(mockFns.signAuthEntry).toHaveBeenCalled();
  });

  it('falls back to preparedAtLedger + 100 when getHealth fails', async () => {
    const signer = new PasskeyKitSigner(RPC_URL, TESTNET_PASSPHRASE, WASM_HASH);
    mockFns.connectWallet.mockResolvedValue({ keyIdBase64: 'key-1', contractId });
    mockFns.rpc.getHealth.mockRejectedValue(new Error('RPC down'));
    mockFns.signAuthEntry.mockImplementation(async (_entry: xdr.SorobanAuthorizationEntry, _: unknown, options: { expiration: number }) => {
      expect(options.expiration).toBe(200); // preparedAtLedger 100 + 100
      return signedAuthEntry(contractId, options.expiration);
    });

    await signer.connectWallet(undefined, contractId);

    const prepared: PreparedTransactionPayload = {
      operationId: 'op-1',
      unsignedXdr: buildUnsignedXdr(contractId),
      networkPassphrase: TESTNET_PASSPHRASE,
      preparedAtLedger: 100,
      intentFingerprint: 'sha256-fake',
    };

    const result = await signer.sign(prepared);
    expect(result.signedXdr).not.toBe(prepared.unsignedXdr);
  });

  it('throws when signAuthEntry returns an unchanged auth entry', async () => {
    const signer = new PasskeyKitSigner(RPC_URL, TESTNET_PASSPHRASE, WASM_HASH);
    mockFns.connectWallet.mockResolvedValue({ keyIdBase64: 'key-1', contractId });
    mockFns.rpc.getHealth.mockResolvedValue({ latestLedger: 150 });
    mockFns.signAuthEntry.mockImplementation(async (entry: xdr.SorobanAuthorizationEntry) => entry);

    await signer.connectWallet(undefined, contractId);

    const prepared: PreparedTransactionPayload = {
      operationId: 'op-1',
      unsignedXdr: buildUnsignedXdr(contractId),
      networkPassphrase: TESTNET_PASSPHRASE,
      preparedAtLedger: 100,
      intentFingerprint: 'sha256-fake',
    };

    await expect(signer.sign(prepared)).rejects.toSatisfy((error: unknown) =>
      error instanceof Error && (error as Error).message.includes('identical auth entry')
    );
  });
});
