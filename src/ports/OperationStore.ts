import { OperationState } from './StellarGateway';
import { PreparedTransactionPayload, SignedTransactionPayload } from './SignerPort';

/**
 * Durable record of a chain operation: state machine + stored intent for
 * idempotency and signed-payload verification.
 */
export type OperationKind =
  | 'register_entity'
  | 'issue_credential'
  | 'revoke_credential'
  | 'link_wallet'
  | 'admin_provision';

export interface StoredOperation {
  state: OperationState;
  intent: {
    kind: OperationKind;
    actorAddress: string;
    fingerprint: string;
    /** Domain key used by readback: entityId for register, credentialId otherwise. */
    subjectKey: string;
    prepared: PreparedTransactionPayload | null;
    /** Signed payload once submitSigned has run; null until then. */
    signed: SignedTransactionPayload | null;
    /** Expected on-chain state for post-confirmation readback. */
    expected?: {
      metadataHash?: string;
      hashSchema?: number;
      revoked?: boolean;
      credentialId?: string;
      issuerId?: string;
      subjectId?: string;
      eventId?: string;
      credentialType?: number;
      issuedBy?: string;
      tokenId?: number;
      revokedLedger?: number;
      revokedReasonHash?: string | null;
      issuedLedger?: number;
    };
  };
  /** Number of processing attempts for exponential backoff. */
  attemptCount?: number;
  /** Earliest time the worker may pick this operation again. */
  nextRetryAt?: Date | null;
}

/**
 * Persistence port for operations. Implementations must guarantee that the
 * same idempotency key never spawns two operations and that transitions go
 * through the domain state machine.
 */
export interface OperationStore {
  /** Returns the existing operation for the key, or null. */
  findByIdempotencyKey(idempotencyKey: string): Promise<StoredOperation | null>;
  get(operationId: string): Promise<StoredOperation | null>;
  /** Creates the operation atomically; throws ALREADY_EXISTS if the
   *  idempotency key is taken. */
  create(record: StoredOperation): Promise<void>;
  save(record: StoredOperation): Promise<void>;
  /**
   * Claims a bounded batch of actionable operations and returns them.
   * Implementations must use a recoverable lock (e.g., PostgreSQL
   * `FOR UPDATE SKIP LOCKED`) and never hand the same row to two workers.
   */
  claimBatch(options: { batchSize: number; workerId: string; ttlSeconds: number }): Promise<StoredOperation[]>;
}
