'use client';
import { domainError } from '@/domain/errors';
import { PreparedTransactionPayload, SignedTransactionPayload, SignerPort } from '@/ports/SignerPort';
import { Address, Transaction, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import type { StorageAdapter, StoredPasskey } from 'passkey-kit';

class InMemoryPasskeyStorage implements StorageAdapter {
  private store = new Map<string, StoredPasskey>();

  async save(passkey: StoredPasskey): Promise<void> {
    this.store.set(passkey.keyId, { ...passkey, lastUsedAt: Date.now() });
  }

  async get(keyId: string): Promise<StoredPasskey | null> {
    return this.store.get(keyId) ?? null;
  }

  async getByContract(contractId: string): Promise<StoredPasskey[]> {
    return [...this.store.values()].filter((p) => p.contractId === contractId);
  }

  async getAll(): Promise<StoredPasskey[]> {
    return [...this.store.values()];
  }

  async delete(keyId: string): Promise<void> {
    this.store.delete(keyId);
  }

  async update(keyId: string, updates: Partial<Omit<StoredPasskey, 'keyId' | 'publicKey'>>): Promise<void> {
    const p = this.store.get(keyId);
    if (p) this.store.set(keyId, { ...p, ...updates });
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

/**
 * Browser-side smart wallet signer using Passkey Kit. The server NEVER
 * signs: it prepares the transaction and this client prompts the user
 * with the passkey to authorize it.
 *
 * The wallet can only be created/connected when its on-chain WASM hash is
 * in the approved allowlist and the RP ID matches the deployed domain.
 */
export class PasskeyKitSigner implements SignerPort {
  private keyId: string | undefined;
  private contractId: string | undefined;
  private kit: import('passkey-kit').PasskeyKit | undefined;
  private storage = new InMemoryPasskeyStorage();

  constructor(
    private readonly rpcUrl: string,
    private readonly networkPassphrase: string,
    private readonly walletWasmHash: string,
    private readonly acceptedWasmHashes: readonly string[] = [walletWasmHash],
    private readonly rpId: string | undefined = undefined
  ) {}

  private async buildKit(): Promise<import('passkey-kit').PasskeyKit> {
    const { PasskeyKit } = await import('passkey-kit');
    return new PasskeyKit({
      rpcUrl: this.rpcUrl,
      networkPassphrase: this.networkPassphrase,
      walletWasmHash: this.walletWasmHash,
      acceptedWasmHashes: [...this.acceptedWasmHashes],
      rpId: this.rpId,
      storage: this.storage,
      // Deployment is always server-side; the client never has a deployer secret.
      deploySource: undefined,
    });
  }

  async createWallet(appName: string, userName: string): Promise<{ keyId: string; contractId: string; signedTx: string }> {
    this.kit = await this.buildKit();
    const { keyIdBase64, contractId, signedTx } = await this.kit.createWallet(appName, userName);
    this.keyId = keyIdBase64;
    this.contractId = contractId;

    // Deployment is server-side: the client only signs the auth entries.
    // The server validates the WASM allowlist and relays/funds the transaction.
    const deployRes = await fetch('/api/smart-wallet/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedTx }),
    });
    const deployResult = (await deployRes.json()) as { success: boolean; txHash?: string; error?: string };
    if (!deployRes.ok || !deployResult.success) {
      throw domainError('INVALID_STATE_TRANSITION', `wallet deployment failed: ${deployResult.error ?? deployRes.statusText}`);
    }

    await this.storage.save({
      keyId: keyIdBase64,
      publicKey: new Uint8Array(0),
      contractId,
      isPrimary: true,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    // createWallet no conecta el kit; la conexión se confirma vía connectWallet
    return { keyId: keyIdBase64, contractId, signedTx };
  }

  async connectWallet(keyIdBase64: string): Promise<string> {
    this.kit = await this.buildKit();
    try {
      const { contractId } = await this.kit.connectWallet({
        keyId: keyIdBase64,
        getContractId: async () => this.contractId,
      });
      this.keyId = keyIdBase64;
      this.contractId = contractId;
      return contractId;
    } catch (error) {
      const detail = error instanceof Error ? error.message : JSON.stringify(error);
      throw new Error(`Could not connect passkey wallet: ${detail}`);
    }
  }

  private credentialsAddress(creds: xdr.SorobanCredentials): xdr.ScAddress {
    const name = creds.switch().name.toLowerCase();
    switch (name) {
      case 'sorobancredentialsaddress':
        return (creds as unknown as { address(): { address(): xdr.ScAddress } }).address().address();
      case 'sorobancredentialsaddressv2':
        return (creds as unknown as { addressV2(): { address(): xdr.ScAddress } }).addressV2().address();
      case 'sorobancredentialsaddresswithdelegates':
        return (creds as unknown as { addressWithDelegates(): { addressCredentials(): { address(): xdr.ScAddress } } })
          .addressWithDelegates()
          .addressCredentials()
          .address();
      default:
        throw domainError('INVALID_INPUT', `Unsupported auth credentials type ${name}`);
    }
  }

  private isWalletAuthEntry(entry: xdr.SorobanAuthorizationEntry): boolean {
    const creds = entry.credentials();
    const name = creds.switch().name.toLowerCase();
    if (name !== 'sorobancredentialsaddress' && name !== 'sorobancredentialsaddressv2') {
      return false;
    }
    if (!this.contractId) return false;
    try {
      return Address.fromScAddress(this.credentialsAddress(creds)).toString() === this.contractId;
    } catch {
      return false;
    }
  }

  async sign(prepared: PreparedTransactionPayload): Promise<SignedTransactionPayload> {
    if (!this.kit || !this.keyId || !this.contractId) {
      throw domainError('INVALID_STATE_TRANSITION', 'Wallet must be created or connected before signing');
    }
    if (prepared.networkPassphrase !== this.networkPassphrase) {
      throw domainError('INVALID_INPUT', 'Prepared payload targets a different network');
    }

    // Asegurar que el kit tiene el wallet conectado antes de firmar
    if (!this.kit.wallet) {
      await this.kit.connectWallet({
        keyId: this.keyId,
        getContractId: async () => this.contractId,
      });
    }

    const tx = TransactionBuilder.fromXDR(prepared.unsignedXdr, this.networkPassphrase) as Transaction;
    if (tx.operations.length !== 1) {
      throw domainError('INVALID_INPUT', 'Expected exactly one operation');
    }
    const op = tx.operations[0] as { type: string } | undefined;
    if (!op || op.type !== 'invokeHostFunction') {
      throw domainError('INVALID_INPUT', 'Prepared payload is not a contract invocation');
    }

    // The Transaction object exposes immutable JS operation objects and a
    // defensive copy of the inner XDR. Mutating `tx.operations[0].auth` does
    // NOT change the serialized envelope. Instead, get the TransactionEnvelope
    // directly and mutate the inner XDR operation's auth array.
    const envelope = tx.toEnvelope();
    const envelopeType = envelope.switch().name;
    if (envelopeType !== 'envelopeTypeTx' && envelopeType !== 'envelopeTypeTxV0') {
      throw domainError('INVALID_INPUT', `Unsupported envelope type ${envelopeType}`);
    }

    const innerTx = (envelope.value() as { tx(): unknown }).tx() as { operations(): unknown[] };
    const innerOps = innerTx.operations();
    if (innerOps.length !== 1) {
      throw domainError('INVALID_INPUT', 'Expected exactly one operation');
    }
    const innerOp = innerOps[0] as xdr.Operation;
    const body = innerOp.body();
    if (!/invoke.?host.?function/i.test(body.switch().name)) {
      throw domainError('INVALID_INPUT', 'Prepared payload is not a contract invocation');
    }
    const hostFn = body.invokeHostFunctionOp();
    const authEntries = hostFn.auth() ?? [];

    const newAuth: xdr.SorobanAuthorizationEntry[] = [];
    let signedCount = 0;

    // The passkey-kit default expiration is derived from the configured
    // timeout (only ~6 ledgers for 30s). Between signing and submission the
    // ledger can advance past that, so we fetch the current ledger and add a
    // generous buffer (100 ledgers ≈ 8 minutes on Testnet).
    let expiration = prepared.preparedAtLedger + 100;
    try {
      const health = await this.kit.rpc.getHealth();
      expiration = health.latestLedger + 100;
    } catch {
      // Fallback to the prepared ledger if the RPC call fails.
    }

    for (const entry of authEntries) {
      if (this.isWalletAuthEntry(entry)) {
        const original = entry.toXDR('base64');
        const signed = await this.kit.signAuthEntry(entry, undefined, { expiration });
        if (signed.toXDR('base64') === original) {
          throw domainError('INVALID_STATE_TRANSITION', 'Passkey signing produced an identical auth entry');
        }
        newAuth.push(signed);
        signedCount++;
      } else {
        newAuth.push(entry);
      }
    }
    if (signedCount === 0) {
      throw domainError('INVALID_INPUT', 'No auth entry for this wallet to sign');
    }

    hostFn.auth(newAuth);

    const signedXdr = envelope.toXDR('base64');

    // Verify that the signatures actually made it through XDR round-trip.
    const verifyTx = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase) as Transaction;
    const verifyEnv = verifyTx.toEnvelope();
    const verifyInnerTx = (verifyEnv.value() as { tx(): unknown }).tx() as { operations(): unknown[] };
    const verifyOp = verifyInnerTx.operations()[0] as xdr.Operation;
    const verifyAuth = (verifyOp.body().invokeHostFunctionOp() as { auth(): xdr.SorobanAuthorizationEntry[] }).auth();
    if (verifyAuth.length !== newAuth.length) {
      throw domainError('INVALID_STATE_TRANSITION', 'Auth entry count changed during XDR round-trip');
    }
    for (let i = 0; i < newAuth.length; i++) {
      if (verifyAuth[i].toXDR('base64') !== newAuth[i].toXDR('base64')) {
        throw domainError('INVALID_STATE_TRANSITION', 'Signed auth entry did not survive XDR round-trip');
      }
    }

    return {
      operationId: prepared.operationId,
      signedXdr,
      signerAddress: this.contractId,
    };
  }
}
