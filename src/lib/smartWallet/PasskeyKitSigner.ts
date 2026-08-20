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

  constructor(
    private readonly rpcUrl: string,
    private readonly networkPassphrase: string,
    private readonly walletWasmHash: string,
    private readonly acceptedWasmHashes: readonly string[] = [walletWasmHash],
    private readonly rpId: string | undefined = undefined
  ) {}

  async createWallet(appName: string, userName: string): Promise<{ keyId: string; contractId: string; signedTx: string }> {
    const { PasskeyKit } = await import('passkey-kit');
    const kit = new PasskeyKit({
      rpcUrl: this.rpcUrl,
      networkPassphrase: this.networkPassphrase,
      walletWasmHash: this.walletWasmHash,
      acceptedWasmHashes: [...this.acceptedWasmHashes],
      rpId: this.rpId,
    });
    const { keyIdBase64, contractId, signedTx } = await kit.createWallet(appName, userName);
    this.keyId = keyIdBase64;
    this.contractId = contractId;
    return { keyId: keyIdBase64, contractId, signedTx };
  }

  async connectWallet(keyIdBase64: string): Promise<string> {
    const { PasskeyKit } = await import('passkey-kit');
    const kit = new PasskeyKit({
      rpcUrl: this.rpcUrl,
      networkPassphrase: this.networkPassphrase,
      walletWasmHash: this.walletWasmHash,
      acceptedWasmHashes: [...this.acceptedWasmHashes],
      rpId: this.rpId,
    });
    const { contractId } = await kit.connectWallet({ keyId: keyIdBase64 });
    this.keyId = keyIdBase64;
    this.contractId = contractId;
    return contractId;
  }

  async sign(prepared: PreparedTransactionPayload): Promise<SignedTransactionPayload> {
    if (!this.keyId || !this.contractId) {
      throw domainError('INVALID_STATE_TRANSITION', 'Wallet must be created or connected before signing');
    }
    void prepared;
    throw domainError(
      'INTERNAL',
      'Smart wallet signing requires a generated domain contract client to build the AssembledTransaction from the prepared XDR.'
    );
  }
}
