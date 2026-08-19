/**
 * Chain interaction port. A transaction hash alone never means success:
 * an operation is `confirmed` only after ledger inclusion AND contract readback.
 */
export type OperationPhase =
  | 'awaiting_signature'
  | 'signed'
  | 'submitted'
  | 'confirming'
  | 'confirmed'
  | 'failed_retryable'
  | 'failed_terminal'
  | 'unknown'
  | 'restoring';

export interface OperationState {
  operationId: string;
  idempotencyKey: string;
  phase: OperationPhase;
  txHash: string | null;
  ledger: number | null;
  errorCode: string | null;
}

export interface RegisterEntityCommand {
  idempotencyKey: string;
  /** On-chain address of the registrar operator; auth is required at this address. */
  actorAddress: string;
  entityId: string;
  metadataHash: string;
  hashSchema: number;
}

export interface IssueCredentialCommand {
  idempotencyKey: string;
  /** On-chain address of the issuing operator, linked to `issuerId`. */
  actorAddress: string;
  credentialId: string;
  issuerId: string;
  subjectId: string;
  eventId: string;
  credentialType: number;
  metadataHash: string;
  hashSchema: number;
}

export interface RevokeCredentialCommand {
  idempotencyKey: string;
  /** On-chain address of the revoker operator, linked to the credential's issuer. */
  actorAddress: string;
  credentialId: string;
  reasonHash: string | null;
}

export interface ChainVerification {
  exists: boolean;
  matches: boolean;
  revoked: boolean;
  ledger: number | null;
}

/**
 * Two-phase chain gateway. The one-shot convenience methods
 * (registerEntity/issueCredential/revokeCredential) run the full pipeline
 * with an injected SignerPort (fixture testnet only). Interactive flows use
 * the prepare/submitSigned pair: the server prepares up to the signing
 * limit and the returned payload goes to the user's signer.
 */
export interface StellarGateway {
  /** Full pipeline with injected signer. NOT for user flows. */
  registerEntity(command: RegisterEntityCommand): Promise<OperationState>;
  issueCredential(command: IssueCredentialCommand): Promise<OperationState>;
  revokeCredential(command: RevokeCredentialCommand): Promise<OperationState>;

  /** Interactive flow: build intent, simulate, detect restore, prepare. */
  prepareRegisterEntity(command: RegisterEntityCommand): Promise<OperationState>;
  prepareIssueCredential(command: IssueCredentialCommand): Promise<OperationState>;
  prepareRevokeCredential(command: RevokeCredentialCommand): Promise<OperationState>;

  /** Accept a signed payload, verify it matches the stored intent, submit,
   *  poll, readback and return the resulting state. */
  submitSigned(operationId: string, signedXdr: string, signerAddress: string): Promise<OperationState>;

  getOperation(operationId: string): Promise<OperationState>;
  /** Unsigned payload for the signer, only while awaiting_signature. */
  getPreparedPayload(operationId: string): Promise<import('./SignerPort').PreparedTransactionPayload>;
  verifyCredential(query: {
    credentialId: string;
    metadataHash: string;
    hashSchema: number;
  }): Promise<ChainVerification>;
  /**
   * Reconciler: poll + readback for an existing operation that is
   * submitted, confirming, unknown or restoring. Idempotent.
   */
  reconcile(operationId: string): Promise<OperationState>;
}
