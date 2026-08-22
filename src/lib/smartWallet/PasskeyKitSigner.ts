'use client';
import { domainError } from '@/domain/errors';
import { PreparedTransactionPayload, SignedTransactionPayload, SignerPort } from '@/ports/SignerPort';
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
    });
  }

  async createWallet(appName: string, userName: string): Promise<{ keyId: string; contractId: string; signedTx: string }> {
    this.kit = await this.buildKit();
    const { keyIdBase64, contractId, signedTx } = await this.kit.createWallet(appName, userName);
    this.keyId = keyIdBase64;
    this.contractId = contractId;

    // Enviar el deployment vía el relayer para que el contrato exista on-chain
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
    const wallet = this.kit.wallet!;

    // Reconstruir el AssembledTransaction desde el XDR preparado
    const assembled = wallet.txFromXDR!(prepared.unsignedXdr) as { toXDR(): string };
    const signed = await this.kit.sign(assembled as unknown as Parameters<typeof this.kit.sign>[0]);
    const signedXdr = (signed as unknown as { toXDR(): string }).toXDR();

    return {
      operationId: prepared.operationId,
      signedXdr,
      signerAddress: this.contractId,
    };
  }
}
