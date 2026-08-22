/**
 * Signing boundary. The server NEVER holds the user's key, passkey, biometry
 * or seed: it prepares the transaction up to the signing limit and hands the
 * payload to whoever implements this port (passkey smart-wallet in Phase 8,
 * controlled testnet fixture only for approved integration tests).
 */
export interface PreparedTransactionPayload {
  operationId: string;
  networkPassphrase: string;
  /** Unsigned/preassembled transaction XDR, ready for the signer. */
  unsignedXdr: string;
  /** Ledger sequence at preparation; used to detect stale intents. */
  preparedAtLedger: number;
  /** Sha-256 of the intent; a signed tx must correspond to THIS intent. */
  intentFingerprint: string;
  /** Contract call spec for restoring/re-simulation (optional). */
  spec?: import('./SorobanTransport').ContractCallSpec;
}

export interface SignedTransactionPayload {
  operationId: string;
  signedXdr: string;
  /** Public address that signed; the gateway verifies it matches the intent's actor. */
  signerAddress: string;
}

export interface SignerPort {
  /**
   * Signs a prepared payload. Implementations must never leak key material
   * to the server; the only thing that comes back is the signed XDR.
   */
  sign(prepared: PreparedTransactionPayload): Promise<SignedTransactionPayload>;
}
