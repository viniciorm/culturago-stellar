import 'server-only';
import { Keypair, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { domainError } from '../../domain/errors';
import { PreparedTransactionPayload, SignedTransactionPayload, SignerPort } from '../../ports/SignerPort';

/**
 * Server-side Ed25519 signer for a testnet admin G-account.
 * NEVER use for user or smart-wallet flows; the secret is held in memory only
 * during the request and is never logged.
 */
export class LocalSigner implements SignerPort {
  private readonly keypair: Keypair;

  constructor(secret: string, private readonly networkPassphrase: string) {
    this.keypair = Keypair.fromSecret(secret);
  }

  get publicKey(): string {
    return this.keypair.publicKey();
  }

  async sign(prepared: PreparedTransactionPayload): Promise<SignedTransactionPayload> {
    const tx = TransactionBuilder.fromXDR(prepared.unsignedXdr, this.networkPassphrase);
    if (tx instanceof Transaction) {
      tx.sign(this.keypair);
      return {
        operationId: prepared.operationId,
        signedXdr: tx.toXDR(),
        signerAddress: this.publicKey,
      };
    }
    throw domainError(
      'INVALID_INPUT',
      'LocalSigner only supports plain transactions; fee-bump admin transactions are not allowed'
    );
  }
}
