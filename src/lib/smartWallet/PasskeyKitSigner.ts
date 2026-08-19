'use client';
import { domainError } from '@/domain/errors';
import { PreparedTransactionPayload, SignedTransactionPayload, SignerPort } from '@/ports/SignerPort';

/**
 * Browser-side smart wallet signer using Passkey Kit. The server NEVER
 * signs: it prepares the transaction and this client prompts the user
 * with the passkey to authorize it.
 *
 * Full signing requires the domain contract client (passkey-kit-sdk) to
 * build an AssembledTransaction. This adapter is wired for the consent
 * flow and throws a clear error until the contract client is generated.
 */
export class PasskeyKitSigner implements SignerPort {
  constructor(
    private readonly rpcUrl: string,
    private readonly networkPassphrase: string,
    private readonly walletWasmHash: string
  ) {}

  async connectWallet(keyIdBase64: string): Promise<string> {
    const { PasskeyKit } = await import('passkey-kit');
    const kit = new PasskeyKit({
      rpcUrl: this.rpcUrl,
      networkPassphrase: this.networkPassphrase,
      walletWasmHash: this.walletWasmHash,
    });
    const { contractId } = await kit.connectWallet({ keyId: keyIdBase64 });
    return contractId;
  }

  async sign(prepared: PreparedTransactionPayload): Promise<SignedTransactionPayload> {
    void prepared;
    throw domainError(
      'INVALID_STATE_TRANSITION',
      'Smart wallet signing requires the generated domain contract client; wire PasskeyKit.sign with the AssembledTransaction built from the prepared payload.'
    );
  }
}
