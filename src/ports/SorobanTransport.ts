/**
 * RPC transport boundary, separate from both SignerPort and the smart-wallet
 * gateway. The real adapter wraps @stellar/stellar-sdk; tests drive the same
 * state machine with a fake transport (Liskov suite without network).
 */

/** Minimal argument model for the two domain contracts. Hex strings are
 *  64-char lowercase SHA-256 digests rendered as BytesN<32> on-chain. */
export type ContractArgValue =
  | { kind: 'address'; address: string }
  | { kind: 'bytes32'; hex: string }
  | { kind: 'u32'; value: number }
  | { kind: 'u64'; value: number }
  | { kind: 'optional_bytes32'; hex: string | null };

export interface ContractCallSpec {
  contractId: string;
  method: string;
  /** Ordered arguments; position 0 is the operator/actor when the method requires auth. */
  args: readonly ContractArgValue[];
  /** Address whose auth the method requires (operator/registrar). */
  actorAddress: string;
}

export interface SimulationOutcome {
  needsRestore: boolean;
  /** Assembled transaction XDR, unsigned. */
  preparedXdr: string;
  latestLedger: number;
  /** Domain error code raised by the contract, if the simulation failed. */
  contractError: string | null;
}

export type TransactionStatusResult =
  | { status: 'SUCCESS'; ledger: number }
  | { status: 'FAILED'; contractError: string | null }
  | { status: 'NOT_FOUND' }
  | { status: 'PENDING' };

export interface SorobanTransport {
  simulate(spec: ContractCallSpec): Promise<SimulationOutcome>;
  /** Accepts a signed XDR; returns the network-assigned hash. A hash alone
   *  NEVER means success — see pollTransaction + readback. */
  submit(signedXdr: string): Promise<{ txHash: string }>;
  pollTransaction(txHash: string): Promise<TransactionStatusResult>;
  /** Read-only contract call used for post-confirmation readback. Returns
   *  the raw result value (decoded by the caller's mapper). */
  readback(spec: ContractCallSpec): Promise<unknown>;
  /** True iff `signedXdr` is exactly the transaction encoded in
   *  `unsignedXdr` plus signatures — no swapped operations, memo or source. */
  verifySignedMatches(unsignedXdr: string, signedXdr: string): Promise<boolean>;
}
