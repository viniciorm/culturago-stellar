import 'server-only';
import { Keypair, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { domainError } from '../../domain/errors';
import {
  PreparedTransactionPayload,
  SignedTransactionPayload,
  SignerPort,
} from '../../ports/SignerPort';
import { getFixtureSignerSecret } from './networkConfig';

/**
 * Controlled Testnet fixture signer. Approved integration tests ONLY:
 * - secret comes from getFixtureSignerSecret() (testnet-gated, opt-in flag);
 * - funds are non-productive; the keypair is never reused in production;
 * - this is NOT a user session and must never be presented as one.
 */
export class TestnetFixtureSigner implements SignerPort {
  private readonly keypair: Keypair;

  constructor() {
    this.keypair = Keypair.fromSecret(getFixtureSignerSecret());
  }

  get address(): string {
    return this.keypair.publicKey();
  }

  async sign(prepared: PreparedTransactionPayload): Promise<SignedTransactionPayload> {
    if (prepared.networkPassphrase !== this.expectedPassphrase()) {
      throw domainError('INVALID_INPUT', 'prepared payload targets a different network');
    }
    const tx = TransactionBuilder.fromXDR(prepared.unsignedXdr, prepared.networkPassphrase);
    if (!(tx instanceof Transaction)) {
      throw domainError('INVALID_INPUT', 'prepared payload is not a classic transaction envelope');
    }
    tx.sign(this.keypair);
    return {
      operationId: prepared.operationId,
      signedXdr: tx.toXDR(),
      signerAddress: this.keypair.publicKey(),
    };
  }

  private expectedPassphrase(): string {
    // The fixture signer is testnet-only by construction.
    return 'Test SDF Network ; September 2015';
  }
}
