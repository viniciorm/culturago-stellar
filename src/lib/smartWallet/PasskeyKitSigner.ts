'use client';
import { domainError } from '@/domain/errors';
import { PreparedTransactionPayload, SignedTransactionPayload, SignerPort } from '@/ports/SignerPort';

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
    });
  }

  async createWallet(appName: string, userName: string): Promise<{ keyId: string; contractId: string; signedTx: string }> {
    this.kit = await this.buildKit();
    const { keyIdBase64, contractId, signedTx } = await this.kit.createWallet(appName, userName);
    this.keyId = keyIdBase64;
    this.contractId = contractId;
    // createWallet no conecta el kit; la conexión se confirma vía connectWallet
    return { keyId: keyIdBase64, contractId, signedTx };
  }

  async connectWallet(keyIdBase64: string): Promise<string> {
    this.kit = await this.buildKit();
    const { contractId } = await this.kit.connectWallet({ keyId: keyIdBase64 });
    this.keyId = keyIdBase64;
    this.contractId = contractId;
    return contractId;
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
      await this.kit.connectWallet({ keyId: this.keyId });
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
