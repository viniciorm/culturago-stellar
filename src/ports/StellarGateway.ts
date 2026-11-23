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

export type V2ContractFamilyCode = 101 | 102 | 103;

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

export interface IssueCredentialV2Command {
  idempotencyKey: string;
  /** On-chain address of the issuing operator, linked to `issuerEntityId`. */
  actorAddress: string;
  /** V2 public_id (e.g. `cg2_...`), hashed with domain `culturago.credential.v2.id\0`. */
  publicId: string;
  /** Domain UUID of the issuer entity. */
  issuerEntityId: string;
  /** Domain UUID of the subject entity. */
  subjectEntityId: string;
  /** Domain UUID of the event entity. */
  eventEntityId: string;
  /** V2 family code on contract: 101 (participant), 102 (guest), 103 (staff). */
  familyCode: V2ContractFamilyCode;
  /** Domain UUID of the participation for 101/102, or null for 103 (staff -> zero scope). */
  participationId: string | null;
  /** 32-byte lowercase hex canonical payload_digest (SHA-256 of CULTURAGO\0culturago.credential.v2\0 || canonicalJson). */
  payloadDigest: string;
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

export interface ChainVerificationV2 extends ChainVerification {
  credentialIdHex: string;
  scopeIdHex: string | null;
  readbackDigest: string | null;
  hashSchema: number | null;
  familyCode: number | null;
  tokenId: string | null;
  scopeMatches: boolean;
}

/**
 * Two-phase chain gateway. The one-shot convenience methods
 * (registerEntity/issueCredential/issueCredentialV2/revokeCredential) run the
 * full pipeline with an injected SignerPort. Interactive flows use the
 * prepare/submitSigned pair: the server prepares up to the signing limit and
 * the returned payload goes to the signer.
 */
export interface StellarGateway {
  /** Full pipeline with injected signer. */
  registerEntity(command: RegisterEntityCommand): Promise<OperationState>;
  issueCredential(command: IssueCredentialCommand): Promise<OperationState>;
  issueCredentialV2(command: IssueCredentialV2Command): Promise<OperationState>;
  revokeCredential(command: RevokeCredentialCommand): Promise<OperationState>;

  /** Interactive flow: build intent, simulate, detect restore, prepare. */
  prepareRegisterEntity(command: RegisterEntityCommand): Promise<OperationState>;
  prepareIssueCredential(command: IssueCredentialCommand): Promise<OperationState>;
  prepareIssueCredentialV2(command: IssueCredentialV2Command): Promise<OperationState>;
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
  verifyCredentialV2(query: {
    publicId: string;
    payloadDigest: string;
    participationId?: string | null;
    familyCode?: V2ContractFamilyCode;
  }): Promise<ChainVerificationV2>;
  /**
   * Reconciler: poll + readback for an existing operation that is
   * submitted, confirming, unknown or restoring. Idempotent.
   */
  reconcile(operationId: string): Promise<OperationState>;
}
