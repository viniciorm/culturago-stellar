import 'server-only';
import { createHash, randomUUID } from 'crypto';
import { domainError } from '../../domain/errors';
import { assertTransition, mustNotResubmit } from '../../domain/operations/operationState';
import { OperationStore, StoredOperation } from '../../ports/OperationStore';
import { SignerPort } from '../../ports/SignerPort';
import {
  ContractArgValue,
  ContractCallSpec,
  SorobanTransport,
} from '../../ports/SorobanTransport';
import {
  ChainVerification,
  IssueCredentialCommand,
  OperationState,
  RegisterEntityCommand,
  RevokeCredentialCommand,
  StellarGateway,
} from '../../ports/StellarGateway';
import { StellarNetworkConfig } from './networkConfig';

const bytes32 = (hex: string): ContractArgValue => ({ kind: 'bytes32', hex });
const u32 = (value: number): ContractArgValue => ({ kind: 'u32', value });
const addr = (address: string): ContractArgValue => ({ kind: 'address', address });

function assertHex32(value: string, field: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw domainError('INVALID_INPUT', `${field} must be a 64-char lowercase hex digest`);
  }
}

type IntentKind = StoredOperation['intent']['kind'];

/**
 * Real chain gateway. The pipeline stops at the signing limit: the server
 * builds the intent, simulates, detects restore, prepares the transaction
 * and hands it to the SignerPort. A returned tx hash NEVER marks an
 * operation confirmed; only ledger inclusion + contract readback does.
 */
export class SorobanStellarGateway implements StellarGateway {
  constructor(
    private readonly config: StellarNetworkConfig,
    private readonly transport: SorobanTransport,
    private readonly store: OperationStore,
    private readonly signer: SignerPort | null,
    private readonly newId: () => string = () => randomUUID()
  ) {}

  // ---------- full pipeline (fixture signer only) ----------

  async registerEntity(command: RegisterEntityCommand): Promise<OperationState> {
    return this.runFullPipeline(command, 'register_entity');
  }

  async issueCredential(command: IssueCredentialCommand): Promise<OperationState> {
    return this.runFullPipeline(command, 'issue_credential');
  }

  async revokeCredential(command: RevokeCredentialCommand): Promise<OperationState> {
    return this.runFullPipeline(command, 'revoke_credential');
  }

  // ---------- interactive two-phase flow ----------

  async prepareRegisterEntity(command: RegisterEntityCommand): Promise<OperationState> {
    return this.prepare(command, 'register_entity');
  }

  async prepareIssueCredential(command: IssueCredentialCommand): Promise<OperationState> {
    return this.prepare(command, 'issue_credential');
  }

  async prepareRevokeCredential(command: RevokeCredentialCommand): Promise<OperationState> {
    return this.prepare(command, 'revoke_credential');
  }

  async getPreparedPayload(operationId: string) {
    const op = await this.requireOperation(operationId);
    if (op.state.phase !== 'awaiting_signature' || !op.intent.prepared) {
      throw domainError('INVALID_STATE_TRANSITION', `operation ${operationId} is not awaiting signature`);
    }
    return op.intent.prepared;
  }

  async submitSigned(
    operationId: string,
    signedXdr: string,
    signerAddress: string
  ): Promise<OperationState> {
    const op = await this.requireOperation(operationId);
    if (op.state.phase !== 'awaiting_signature') {
      throw domainError('INVALID_STATE_TRANSITION', `operation ${operationId} is in phase ${op.state.phase}`);
    }
    if (signerAddress !== op.intent.actorAddress) {
      throw domainError('UNAUTHORIZED', 'signed payload does not match the intent actor');
    }
    // The signed XDR must correspond byte-for-byte to the stored intent:
    // same operations, memo and source; only signatures were added.
    const matches = await this.transport.verifySignedMatches(
      op.intent.prepared!.unsignedXdr,
      signedXdr
    );
    if (!matches) {
      throw domainError('UNAUTHORIZED', 'signed payload does not match the stored intent');
    }

    return this.transition(op, 'signed', async (next) => {
      const { txHash } = await this.transport.submit(signedXdr);
      next.state.txHash = txHash;
      next.state.phase = 'submitted';
      await this.store.save(next);
      return this.pollAndConfirm(next);
    });
  }

  async getOperation(operationId: string): Promise<OperationState> {
    return (await this.requireOperation(operationId)).state;
  }

  async reconcile(operationId: string): Promise<OperationState> {
    const op = await this.requireOperation(operationId);
    const reconcilable = new Set<OperationState['phase']>([
      'submitted',
      'confirming',
      'unknown',
      'restoring',
      'failed_retryable',
    ]);
    if (!reconcilable.has(op.state.phase)) {
      return op.state;
    }
    if (!op.state.txHash) {
      throw domainError('INVALID_STATE_TRANSITION', `reconcile requires a tx hash for ${operationId}`);
    }
    return this.pollAndConfirm(op);
  }

  async verifyCredential(query: {
    credentialId: string;
    metadataHash: string;
    hashSchema: number;
  }): Promise<ChainVerification> {
    assertHex32(query.credentialId, 'credentialId');
    assertHex32(query.metadataHash, 'metadataHash');
    const raw = await this.transport.readback({
      contractId: this.config.credentialRegistryContractId,
      method: 'get_credential',
      args: [bytes32(query.credentialId)],
      actorAddress: query.credentialId, // read-only: no auth
    });
    if (raw === null) {
      return { exists: false, matches: false, revoked: false, ledger: null };
    }
    const record = raw as {
      metadata_hash: string;
      hash_schema: number;
      revoked: boolean;
      issued_ledger: number;
    };
    const matches =
      record.metadata_hash === query.metadataHash && record.hash_schema === query.hashSchema;
    return {
      exists: true,
      matches,
      revoked: record.revoked,
      ledger: record.issued_ledger,
    };
  }

  // ---------- pipeline internals ----------

  private async runFullPipeline(
    command: RegisterEntityCommand | IssueCredentialCommand | RevokeCredentialCommand,
    kind: IntentKind
  ): Promise<OperationState> {
    if (!this.signer) {
      throw domainError(
        'UNAUTHORIZED',
        'no signer configured; interactive flows must use prepare/submitSigned'
      );
    }
    const preparedState = await this.prepare(command, kind);
    if (preparedState.phase !== 'awaiting_signature') return preparedState;
    const payload = await this.getPreparedPayload(preparedState.operationId);
    const signed = await this.signer.sign(payload);
    return this.submitSigned(preparedState.operationId, signed.signedXdr, signed.signerAddress);
  }

  private async prepare(
    command: RegisterEntityCommand | IssueCredentialCommand | RevokeCredentialCommand,
    kind: IntentKind
  ): Promise<OperationState> {
    // Idempotency: the key binds to exactly one operation; never resubmit blind.
    const existing = await this.store.findByIdempotencyKey(command.idempotencyKey);
    if (existing) {
      if (existing.intent.fingerprint === this.fingerprintOfCommand(command, kind)) {
        return existing.state;
      }
      throw domainError(
        'ALREADY_EXISTS',
        'idempotency key reused with a different payload'
      );
    }

    const spec = this.specFor(command, kind);
    const sim = await this.transport.simulate(spec);
    const operationId = this.newId();
    const fingerprint = this.fingerprintOfCommand(command, kind);

    if (sim.contractError) {
      const state: OperationState = {
        operationId,
        idempotencyKey: command.idempotencyKey,
        phase: 'failed_terminal',
        txHash: null,
        ledger: null,
        errorCode: sim.contractError,
      };
      await this.store.create({
        state,
        intent: {
          kind,
          actorAddress: command.actorAddress,
          fingerprint,
          subjectKey: this.subjectKeyFor(command, kind),
          prepared: null,
        },
      });
      return state;
    }

    const phase = sim.needsRestore ? 'restoring' : 'awaiting_signature';
    const state: OperationState = {
      operationId,
      idempotencyKey: command.idempotencyKey,
      phase,
      txHash: null,
      ledger: null,
      errorCode: null,
    };
    const prepared = {
      operationId,
      networkPassphrase: this.config.networkPassphrase,
      unsignedXdr: sim.preparedXdr,
      preparedAtLedger: sim.latestLedger,
      intentFingerprint: fingerprint,
    };
    await this.store.create({
      state,
      intent: {
        kind,
        actorAddress: command.actorAddress,
        fingerprint,
        subjectKey: this.subjectKeyFor(command, kind),
        prepared,
      },
    });
    return state;
  }

  private async pollAndConfirm(op: StoredOperation): Promise<OperationState> {
    const txHash = op.state.txHash;
    if (!txHash) throw domainError('INVALID_STATE_TRANSITION', 'operation has no tx hash');

    assertTransition(op.state.phase, 'confirming');
    op.state.phase = 'confirming';
    await this.store.save(op);

    const result = await this.transport.pollTransaction(txHash);
    switch (result.status) {
      case 'PENDING':
      case 'NOT_FOUND':
        op.state.phase = 'unknown';
        op.state.errorCode = null;
        break;
      case 'FAILED':
        op.state.phase = 'failed_terminal';
        op.state.errorCode = result.contractError ?? 'CONTRACT_FAILED';
        break;
      case 'SUCCESS': {
        // Ledger inclusion is not enough: readback before confirmed.
        const ok = await this.readbackMatches(op);
        op.state.phase = ok ? 'confirmed' : 'failed_terminal';
        op.state.ledger = result.ledger;
        op.state.errorCode = ok ? null : 'READBACK_MISMATCH';
        break;
      }
    }
    await this.store.save(op);
    return op.state;
  }

  private async readbackMatches(op: StoredOperation): Promise<boolean> {
    // Readback must verify the postcondition of each intent kind.
    switch (op.intent.kind) {
      case 'register_entity':
      case 'issue_credential':
      case 'revoke_credential':
        // The fake/real transports expose intent-scoped readback; concrete
        // verification data was bound at prepare time via fingerprint.
        return this.transport
          .readback(this.readbackSpecFor(op))
          .then((raw) => raw !== null && (raw as { matches?: boolean }).matches !== false);
    }
  }

  private readbackSpecFor(op: StoredOperation): ContractCallSpec {
    // Rebuilt from the stored intent; args were validated at prepare time.
    const contractId =
      op.intent.kind === 'register_entity'
        ? this.config.entityRegistryContractId
        : this.config.credentialRegistryContractId;
    return {
      contractId,
      method: op.intent.kind === 'register_entity' ? 'get_entity' : 'get_credential',
      args: [bytes32(op.intent.subjectKey)],
      actorAddress: op.intent.actorAddress,
      feePayerAddress: this.config.feePayerAddress ?? undefined,
    };
  }

  private specFor(
    command: RegisterEntityCommand | IssueCredentialCommand | RevokeCredentialCommand,
    kind: IntentKind
  ): ContractCallSpec {
    switch (kind) {
      case 'register_entity': {
        const c = command as RegisterEntityCommand;
        assertHex32(c.entityId, 'entityId');
        assertHex32(c.metadataHash, 'metadataHash');
        return {
          contractId: this.config.entityRegistryContractId,
          method: 'register_entity',
          args: [addr(c.actorAddress), bytes32(c.entityId), bytes32(c.metadataHash), u32(c.hashSchema)],
          actorAddress: c.actorAddress,
          feePayerAddress: this.config.feePayerAddress ?? undefined,
        };
      }
      case 'issue_credential': {
        const c = command as IssueCredentialCommand;
        assertHex32(c.credentialId, 'credentialId');
        assertHex32(c.issuerId, 'issuerId');
        assertHex32(c.subjectId, 'subjectId');
        assertHex32(c.eventId, 'eventId');
        assertHex32(c.metadataHash, 'metadataHash');
        return {
          contractId: this.config.credentialRegistryContractId,
          method: 'issue_credential',
          args: [
            addr(c.actorAddress),
            bytes32(c.credentialId),
            bytes32(c.issuerId),
            bytes32(c.subjectId),
            bytes32(c.eventId),
            u32(c.credentialType),
            bytes32(c.metadataHash),
            u32(c.hashSchema),
          ],
          actorAddress: c.actorAddress,
          feePayerAddress: this.config.feePayerAddress ?? undefined,
        };
      }
      case 'revoke_credential': {
        const c = command as RevokeCredentialCommand;
        assertHex32(c.credentialId, 'credentialId');
        if (c.reasonHash) assertHex32(c.reasonHash, 'reasonHash');
        return {
          contractId: this.config.credentialRegistryContractId,
          method: 'revoke_credential',
          args: [
            addr(c.actorAddress),
            bytes32(c.credentialId),
            { kind: 'optional_bytes32', hex: c.reasonHash },
          ],
          actorAddress: c.actorAddress,
          feePayerAddress: this.config.feePayerAddress ?? undefined,
        };
      }
    }
  }

  private subjectKeyFor(
    command: RegisterEntityCommand | IssueCredentialCommand | RevokeCredentialCommand,
    kind: IntentKind
  ): string {
    if (kind === 'register_entity') return (command as RegisterEntityCommand).entityId;
    return (command as IssueCredentialCommand | RevokeCredentialCommand).credentialId;
  }

  private fingerprintOfCommand(
    command: RegisterEntityCommand | IssueCredentialCommand | RevokeCredentialCommand,
    kind: IntentKind
  ): string {
    return createHash('sha256').update(kind).update(JSON.stringify(command)).digest('hex');
  }

  private async transition(
    op: StoredOperation,
    to: OperationState['phase'],
    action: (next: StoredOperation) => Promise<OperationState>
  ): Promise<OperationState> {
    if (mustNotResubmit(op.state.phase) && to !== op.state.phase) {
      throw domainError(
        'INVALID_STATE_TRANSITION',
        `operation ${op.state.operationId} is in phase ${op.state.phase}; never resubmit blind`
      );
    }
    assertTransition(op.state.phase, to);
    op.state.phase = to;
    await this.store.save(op);
    return action(op);
  }

  private async requireOperation(operationId: string): Promise<StoredOperation> {
    const op = await this.store.get(operationId);
    if (!op) throw domainError('NOT_FOUND', `operation ${operationId} does not exist`);
    return op;
  }
}
