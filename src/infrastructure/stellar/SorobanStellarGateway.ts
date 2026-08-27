import 'server-only';
import { randomUUID } from 'crypto';
import { Address, Keypair, Transaction, TransactionBuilder, scValToNative, xdr } from '@stellar/stellar-sdk';
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
import { CanonicalHashPort, HashSchemaId } from '../../ports/CanonicalHashPort';
import { CanonicalHashService } from '../hashing/CanonicalHashService';

const bytes32 = (hex: string): ContractArgValue => ({ kind: 'bytes32', hex });
const u32 = (value: number): ContractArgValue => ({ kind: 'u32', value });
const addr = (address: string): ContractArgValue => ({ kind: 'address', address });

function assertHex32(value: string, field: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw domainError('INVALID_INPUT', `${field} must be a 64-char lowercase hex digest`);
  }
}

function toHexString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.toLowerCase();
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (ArrayBuffer.isView(value)) {
    const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    return buf.toString('hex');
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return null;
}

function toBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

function toAddressString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value instanceof Address) return value.toString();
  return null;
}

function credentialRecordMatches(
  raw: unknown,
  expected: NonNullable<StoredOperation['intent']['expected']>,
  ledger: number | null,
  kind: 'issue_credential' | 'revoke_credential'
): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const record = raw as Record<string, unknown>;

  if (expected.credentialId !== undefined && toHexString(record.credential_id) !== expected.credentialId) return false;
  if (expected.issuerId !== undefined && toHexString(record.issuer_id) !== expected.issuerId) return false;
  if (expected.subjectId !== undefined && toHexString(record.subject_id) !== expected.subjectId) return false;
  if (expected.eventId !== undefined && toHexString(record.event_id) !== expected.eventId) return false;
  if (expected.credentialType !== undefined && toNumber(record.credential_type) !== expected.credentialType) return false;
  if (expected.metadataHash !== undefined && toHexString(record.metadata_hash) !== expected.metadataHash) return false;
  if (expected.hashSchema !== undefined && toNumber(record.hash_schema) !== expected.hashSchema) return false;
  if (expected.issuedBy !== undefined && toAddressString(record.issued_by) !== expected.issuedBy) return false;

  const revoked = toBool(record.revoked);
  if (expected.revoked !== undefined && revoked !== expected.revoked) return false;

  if (kind === 'issue_credential') {
    if (revoked !== false) return false;
    const issuedLedger = toNumber(record.issued_ledger);
    if (ledger !== null && issuedLedger !== null && issuedLedger !== ledger) return false;
    return true;
  }

  if (kind === 'revoke_credential') {
    if (revoked !== true) return false;
    const revokedLedger = toNumber(record.revoked_ledger);
    if (ledger !== null && revokedLedger !== null && revokedLedger !== ledger) return false;
    if (expected.revokedReasonHash !== undefined && toHexString(record.revoked_reason_hash) !== expected.revokedReasonHash) return false;
    return true;
  }

  return false;
}

type IntentKind = 'register_entity' | 'issue_credential' | 'revoke_credential';

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
    private readonly newId: () => string = () => randomUUID(),
    private readonly canonicalHash: CanonicalHashPort = new CanonicalHashService()
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
    console.log('[SorobanStellarGateway.getPreparedPayload] opId:', operationId, 'phase:', op.state.phase, 'hasPrepared:', !!op.intent.prepared);
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
    if (op.state.phase !== 'awaiting_signature' && op.state.phase !== 'signed') {
      throw domainError('INVALID_STATE_TRANSITION', `operation ${operationId} is in phase ${op.state.phase}`);
    }

    // Recovery from a previously signed (but not yet submitted) operation.
    if (op.state.phase === 'signed') {
      if (!op.intent.signed) {
        throw domainError('INVALID_STATE_TRANSITION', `operation ${operationId} is signed but has no stored payload`);
      }
      if (signedXdr !== op.intent.signed.signedXdr || signerAddress !== op.intent.signed.signerAddress) {
        throw domainError('UNAUTHORIZED', 'signed payload mismatch during recovery');
      }
      try {
        const { txHash } = await this.transport.submit(op.intent.signed.signedXdr);
        console.log('[submitSigned] recovery opId:', operationId, 'txHash:', txHash);
        op.state.txHash = txHash;
        op.state.phase = 'submitted';
        await this.store.save(op);
        return this.pollAndConfirm(op);
      } catch (error) {
        this.scheduleRetry(op);
        op.state.errorCode = error instanceof Error ? error.message : 'SUBMIT_FAILED';
        await this.store.save(op);
        throw domainError('INVALID_STATE_TRANSITION', 'transaction submission failed, queued for retry');
      }
    }

    if (signerAddress !== op.intent.actorAddress) {
      throw domainError('UNAUTHORIZED', 'signed payload does not match the intent actor');
    }

    let finalXdr = signedXdr;

    if (signerAddress.startsWith('C')) {
      // Smart wallet: the passkey only signs the operation auth entries.
      // Validate that the signed envelope matches the prepared intent before
      // re-simulating in enforcing mode with the real signature.
      if (!this.config.feePayerSecret) {
        throw domainError('UNAUTHORIZED', 'fee payer is not configured for smart wallet submission');
      }
      this.assertSmartWalletSignedMatches(
        op.intent.prepared!.unsignedXdr,
        signedXdr,
        signerAddress
      );

      const enforced = await this.transport.enforcingSimulateAndAssemble(signedXdr);
      console.log('[submitSigned] enforcing result:', {
        contractError: enforced.contractError,
        needsRestore: enforced.needsRestore,
        preparedXdrLength: enforced.preparedXdr.length,
      });
      if (enforced.contractError) {
        throw domainError(
          'UNAUTHORIZED',
          `smart wallet enforcing simulation failed: ${enforced.contractError}`
        );
      }

      const tx = TransactionBuilder.fromXDR(
        enforced.preparedXdr,
        this.config.networkPassphrase
      ) as Transaction;
      tx.sign(Keypair.fromSecret(this.config.feePayerSecret));
      finalXdr = tx.toEnvelope().toXDR('base64');
    } else {
      // Classic account: the signer is the source, hash remains stable.
      const matches = await this.transport.verifySignedMatches(
        op.intent.prepared!.unsignedXdr,
        signedXdr
      );
      if (!matches) {
        throw domainError('UNAUTHORIZED', 'signed payload does not match the stored intent');
      }
    }

    // Persist the signed payload in the 'signed' phase BEFORE touching the
    // network. This closes the crash window between signing and submission.
    op.intent.signed = {
      operationId: op.state.operationId,
      signedXdr: finalXdr,
      signerAddress,
    };
    op.state.phase = 'signed';
    await this.store.save(op);

    let txHash: string;
    try {
      const result = await this.transport.submit(finalXdr);
      txHash = result.txHash;
    } catch (error) {
      this.scheduleRetry(op);
      op.state.errorCode = error instanceof Error ? error.message : 'SUBMIT_FAILED';
      await this.store.save(op);
      throw domainError('INVALID_STATE_TRANSITION', 'transaction submission failed, queued for retry');
    }
    console.log('[submitSigned] opId:', op.state.operationId, 'txHash:', txHash);
    op.state.txHash = txHash;
    op.state.phase = 'submitted';
    await this.store.save(op);
    return this.pollAndConfirm(op);
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
    assertHex32(query.metadataHash, 'metadataHash');
    const credentialHash = await this.canonicalHash.hashDocument(
      'culturago.credential.v1',
      query.credentialId
    );
    const raw = await this.transport.readback({
      contractId: this.config.credentialRegistryContractId,
      method: 'get_credential',
      args: [bytes32(credentialHash)],
      actorAddress: this.config.feePayerAddress ?? query.credentialId,
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
    const idempotencyKey = this.canonicalIdempotencyKey(command, kind);
    // Idempotency: the key binds to exactly one operation; never resubmit blind.
    const existing = await this.store.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.intent.fingerprint === (await this.fingerprintOfCommand(command, kind))) {
        return existing.state;
      }
      throw domainError(
        'ALREADY_EXISTS',
        'idempotency key reused with a different payload'
      );
    }

    const contractCall = await this.specFor(command, kind);
    const sim = await this.transport.simulate(contractCall);
    const operationId = this.newId();
    const fingerprint = await this.fingerprintOfCommand(command, kind);

    console.log('[SorobanStellarGateway.prepare] kind:', kind, 'opId:', operationId, 'needsRestore:', sim.needsRestore, 'contractError:', sim.contractError);
    console.log('[SorobanStellarGateway.prepare] feePayerSecret present:', !!this.config.feePayerSecret);

    if (sim.contractError) {
      const state: OperationState = {
        operationId,
        idempotencyKey,
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
          subjectKey: await this.subjectKeyFor(command, kind),
          prepared: null,
          signed: null,
        },
      });
      return state;
    }

    let unsignedXdr = sim.preparedXdr;
    let preparedAtLedger = sim.latestLedger;
    let phase: OperationState['phase'] = sim.needsRestore ? 'restoring' : 'awaiting_signature';

    if (sim.needsRestore && this.config.feePayerSecret) {
      const signed = this.signWithFeePayer(unsignedXdr);
      const { txHash } = await this.transport.submit(signed);
      await this.waitForSuccess(txHash);
      const sim2 = await this.transport.simulate(contractCall);
      if (sim2.contractError) {
        const state2: OperationState = {
          operationId,
          idempotencyKey,
          phase: 'failed_terminal',
          txHash,
          ledger: null,
          errorCode: sim2.contractError,
        };
        await this.store.create({
          state: state2,
          intent: {
            kind,
            actorAddress: command.actorAddress,
            fingerprint,
            subjectKey: await this.subjectKeyFor(command, kind),
            prepared: null,
            signed: null,
          },
        });
        return state2;
      }
      if (sim2.needsRestore) {
        throw domainError('INVALID_STATE_TRANSITION', 'restore did not clear TTL requirement');
      }
      unsignedXdr = sim2.preparedXdr;
      preparedAtLedger = sim2.latestLedger;
      phase = 'awaiting_signature';
    }

    const state: OperationState = {
      operationId,
      idempotencyKey,
      phase,
      txHash: null,
      ledger: null,
      errorCode: null,
    };
    const prepared = {
      operationId,
      networkPassphrase: this.config.networkPassphrase,
      unsignedXdr,
      preparedAtLedger,
      intentFingerprint: fingerprint,
    };
    await this.store.create({
      state,
      intent: {
        kind,
        actorAddress: command.actorAddress,
        fingerprint,
        subjectKey: await this.subjectKeyFor(command, kind),
        prepared,
        signed: null,
        expected: await this.expectedFor(command, kind),
      },
    });
    console.log('[SorobanStellarGateway.prepare] created operation', operationId, 'phase:', phase, 'prepared null:', !prepared);
    return state;
  }

  private signWithFeePayer(unsignedXdr: string): string {
    if (!this.config.feePayerSecret) {
      throw domainError('UNAUTHORIZED', 'fee payer secret is not configured');
    }
    const tx = TransactionBuilder.fromXDR(unsignedXdr, this.config.networkPassphrase);
    if (!(tx instanceof Transaction)) {
      throw domainError('INVALID_INPUT', 'restore transaction is not a plain transaction');
    }
    tx.sign(Keypair.fromSecret(this.config.feePayerSecret));
    return tx.toXDR();
  }

  private async waitForSuccess(txHash: string): Promise<void> {
    const maxAttempts = 15;
    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.transport.pollTransaction(txHash);
      if (result.status === 'SUCCESS') return;
      if (result.status === 'FAILED') {
        throw domainError('INVALID_STATE_TRANSITION', `restore transaction failed: ${result.contractError ?? 'unknown'}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw domainError('INVALID_STATE_TRANSITION', 'restore transaction did not confirm in time');
  }

  private async pollAndConfirm(op: StoredOperation): Promise<OperationState> {
    const txHash = op.state.txHash;
    if (!txHash) throw domainError('INVALID_STATE_TRANSITION', 'operation has no tx hash');

    assertTransition(op.state.phase, 'confirming');
    op.state.phase = 'confirming';
    await this.store.save(op);

    const result = await this.transport.pollTransaction(txHash);
    console.log('[pollAndConfirm] opId:', op.state.operationId, 'txHash:', txHash, 'result:', result);
    switch (result.status) {
      case 'PENDING':
      case 'NOT_FOUND':
        this.markUnknown(op);
        break;
      case 'FAILED':
        op.state.phase = 'failed_terminal';
        op.state.errorCode = result.contractError ?? 'CONTRACT_FAILED';
        op.nextRetryAt = null;
        if ('diagnosticEventsXdr' in result && result.diagnosticEventsXdr) {
          console.log(
            '[pollAndConfirm] diagnostics:',
            result.diagnosticEventsXdr
          );
        }
        if ('resultXdr' in result && result.resultXdr) {
          console.log('[pollAndConfirm] resultXdr:', result.resultXdr);
        }
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
    const raw = await this.transport.readback(this.readbackSpecFor(op));
    if (raw === null) return false;

    switch (op.intent.kind) {
      case 'register_entity': {
        return raw === true;
      }
      case 'issue_credential': {
        if (!op.intent.expected) return false;
        return credentialRecordMatches(raw, op.intent.expected, op.state.ledger, 'issue_credential');
      }
      case 'revoke_credential': {
        if (!op.intent.expected) return false;
        return credentialRecordMatches(raw, op.intent.expected, op.state.ledger, 'revoke_credential');
      }
      case 'link_wallet':
      case 'admin_provision':
        // These intents are not processed by SorobanStellarGateway.
        return false;
    }
  }

  private readbackSpecFor(op: StoredOperation): ContractCallSpec {
    // Rebuilt from the stored intent; args were validated at prepare time.
    const contractId =
      op.intent.kind === 'register_entity'
        ? this.config.entityRegistryContractId
        : this.config.credentialRegistryContractId;

    if (op.intent.kind === 'register_entity') {
      const expected = op.intent.expected;
      return {
        contractId,
        method: 'verify_entity',
        args: [
          bytes32(op.intent.subjectKey),
          u32(1),
          bytes32(expected?.metadataHash ?? '0'.repeat(64)),
          u32(expected?.hashSchema ?? 0),
        ],
        actorAddress: op.intent.actorAddress,
        feePayerAddress: this.config.feePayerAddress ?? undefined,
      };
    }

    if (op.intent.kind === 'issue_credential' || op.intent.kind === 'revoke_credential') {
      return {
        contractId,
        method: 'get_credential',
        args: [bytes32(op.intent.subjectKey)],
        actorAddress: op.intent.actorAddress,
        feePayerAddress: this.config.feePayerAddress ?? undefined,
      };
    }

    return {
      contractId,
      method: 'get_credential',
      args: [bytes32(op.intent.subjectKey)],
      actorAddress: op.intent.actorAddress,
      feePayerAddress: this.config.feePayerAddress ?? undefined,
    };
  }

  private async expectedFor(
    command: RegisterEntityCommand | IssueCredentialCommand | RevokeCredentialCommand,
    kind: IntentKind
  ): Promise<StoredOperation['intent']['expected']> {
    switch (kind) {
      case 'register_entity': {
        const c = command as RegisterEntityCommand;
        return { metadataHash: c.metadataHash, hashSchema: c.hashSchema };
      }
      case 'issue_credential': {
        const c = command as IssueCredentialCommand;
        const [credentialId, issuerId, subjectId, eventId] = await Promise.all([
          this.canonicalHash.hashDocument('culturago.credential.v1', c.credentialId),
          this.canonicalHash.hashDocument('culturago.entity.v1', c.issuerId),
          this.canonicalHash.hashDocument('culturago.entity.v1', c.subjectId),
          this.canonicalHash.hashDocument('culturago.entity.v1', c.eventId),
        ]);
        return {
          credentialId,
          issuerId,
          subjectId,
          eventId,
          credentialType: c.credentialType,
          metadataHash: c.metadataHash,
          hashSchema: c.hashSchema,
          issuedBy: c.actorAddress,
          revoked: false,
        };
      }
      case 'revoke_credential': {
        const c = command as RevokeCredentialCommand;
        const credentialId = await this.canonicalHash.hashDocument(
          'culturago.credential.v1',
          c.credentialId
        );
        return {
          credentialId,
          revoked: true,
          revokedReasonHash: c.reasonHash,
        };
      }
    }
  }

  private async specFor(
    command: RegisterEntityCommand | IssueCredentialCommand | RevokeCredentialCommand,
    kind: IntentKind
  ): Promise<ContractCallSpec> {
    switch (kind) {
      case 'register_entity': {
        const c = command as RegisterEntityCommand;
        assertHex32(c.metadataHash, 'metadataHash');
        const entityHash = await this.canonicalHash.hashDocument(
          'culturago.entity.v1',
          c.entityId
        );
        return {
          contractId: this.config.entityRegistryContractId,
          method: 'register_entity',
          args: [addr(c.actorAddress), bytes32(entityHash), bytes32(c.metadataHash), u32(c.hashSchema)],
          actorAddress: c.actorAddress,
          feePayerAddress: this.config.feePayerAddress ?? undefined,
        };
      }
      case 'issue_credential': {
        const c = command as IssueCredentialCommand;
        assertHex32(c.metadataHash, 'metadataHash');
        const [credentialHash, issuerHash, subjectHash, eventHash] = await Promise.all([
          this.canonicalHash.hashDocument('culturago.credential.v1', c.credentialId),
          this.canonicalHash.hashDocument('culturago.entity.v1', c.issuerId),
          this.canonicalHash.hashDocument('culturago.entity.v1', c.subjectId),
          this.canonicalHash.hashDocument('culturago.entity.v1', c.eventId),
        ]);
        return {
          contractId: this.config.credentialRegistryContractId,
          method: 'issue_credential',
          args: [
            addr(c.actorAddress),
            bytes32(credentialHash),
            bytes32(issuerHash),
            bytes32(subjectHash),
            bytes32(eventHash),
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
        const credentialHash = await this.canonicalHash.hashDocument(
          'culturago.credential.v1',
          c.credentialId
        );
        if (c.reasonHash) assertHex32(c.reasonHash, 'reasonHash');
        return {
          contractId: this.config.credentialRegistryContractId,
          method: 'revoke_credential',
          args: [
            addr(c.actorAddress),
            bytes32(credentialHash),
            { kind: 'optional_bytes32', hex: c.reasonHash },
          ],
          actorAddress: c.actorAddress,
          feePayerAddress: this.config.feePayerAddress ?? undefined,
        };
      }
    }
  }

  private async subjectKeyFor(
    command: RegisterEntityCommand | IssueCredentialCommand | RevokeCredentialCommand,
    kind: IntentKind
  ): Promise<string> {
    const schema: HashSchemaId =
      kind === 'register_entity' ? 'culturago.entity.v1' : 'culturago.credential.v1';
    const id =
      kind === 'register_entity'
        ? (command as RegisterEntityCommand).entityId
        : (command as IssueCredentialCommand | RevokeCredentialCommand).credentialId;
    return this.canonicalHash.hashDocument(schema, id);
  }

  private canonicalIdempotencyKey(
    command: RegisterEntityCommand | IssueCredentialCommand | RevokeCredentialCommand,
    kind: IntentKind
  ): string {
    if (kind === 'issue_credential') {
      const c = command as IssueCredentialCommand;
      return `issue:${c.credentialId}`;
    }
    if (kind === 'revoke_credential') {
      const c = command as RevokeCredentialCommand;
      return `revoke:${c.credentialId}:${c.reasonHash ?? ''}`;
    }
    const c = command as RegisterEntityCommand;
    return `register:${c.entityId}`;
  }

  private async fingerprintOfCommand(
    command: RegisterEntityCommand | IssueCredentialCommand | RevokeCredentialCommand,
    kind: IntentKind
  ): Promise<string> {
    const commandWithoutId = { ...command } as { idempotencyKey?: unknown };
    delete commandWithoutId.idempotencyKey;
    return this.canonicalHash.hashDocument('culturago.fingerprint.v1', { kind, command: commandWithoutId });
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

  private backoffMs(attempt: number): number {
    const base = 2_000;
    const max = 60_000;
    return Math.min(base * 2 ** attempt, max);
  }

  private scheduleRetry(op: StoredOperation): void {
    op.attemptCount = (op.attemptCount ?? 0) + 1;
    op.nextRetryAt = new Date(Date.now() + this.backoffMs(op.attemptCount ?? 1));
  }

  private markRetryable(op: StoredOperation, errorCode: string): void {
    this.scheduleRetry(op);
    op.state.errorCode = errorCode;
    op.state.phase = 'failed_retryable';
  }

  private markUnknown(op: StoredOperation): void {
    this.scheduleRetry(op);
    op.state.errorCode = null;
    op.state.phase = 'unknown';
  }

  // ---------- XDR structural validation for smart wallets ----------

  private getHostFunctionOp(tx: Transaction): {
    innerTx: xdr.Transaction;
    op: xdr.Operation;
    hostFn: xdr.InvokeHostFunctionOp;
  } {
    const envelope = tx.toEnvelope();
    const envelopeType = envelope.switch().name;
    if (envelopeType !== 'envelopeTypeTx' && envelopeType !== 'envelopeTypeTxV0') {
      throw domainError('INVALID_INPUT', 'Unsupported envelope type');
    }
    const innerTx = (envelope.value() as { tx(): xdr.Transaction }).tx();
    const ops = innerTx.operations();
    if (ops.length !== 1) {
      throw domainError('INVALID_INPUT', 'Expected exactly one operation');
    }
    const op = ops[0] as xdr.Operation;
    const body = op.body();
    if (!/invoke.?host.?function/i.test(body.switch().name)) {
      throw domainError('INVALID_INPUT', 'Prepared payload is not a contract invocation');
    }
    return { innerTx, op, hostFn: body.invokeHostFunctionOp() };
  }

  private authEntryAddress(entry: xdr.SorobanAuthorizationEntry): string {
    const creds = entry.credentials();
    const name = creds.switch().name.toLowerCase();
    let scAddress: xdr.ScAddress;
    switch (name) {
      case 'sorobancredentialsaddress':
        scAddress = (creds as unknown as { address(): { address(): xdr.ScAddress } }).address().address();
        break;
      case 'sorobancredentialsaddressv2':
        scAddress = (creds as unknown as { addressV2(): { address(): xdr.ScAddress } }).addressV2().address();
        break;
      case 'sorobancredentialsaddresswithdelegates':
        scAddress = (creds as unknown as { addressWithDelegates(): { addressCredentials(): { address(): xdr.ScAddress } } })
          .addressWithDelegates()
          .addressCredentials()
          .address();
        break;
      default:
        throw domainError('INVALID_INPUT', 'Unsupported auth credentials type');
    }
    return Address.fromScAddress(scAddress).toString();
  }

  private isAddressBound(entry: xdr.SorobanAuthorizationEntry): boolean {
    const name = entry.credentials().switch().name.toLowerCase();
    return name === 'sorobancredentialsaddressv2' || name === 'sorobancredentialsaddresswithdelegates';
  }

  private hasAuthSignature(entry: xdr.SorobanAuthorizationEntry): boolean {
    const creds = entry.credentials();
    const addressCreds = (() => {
      switch (creds.switch().name.toLowerCase()) {
        case 'sorobancredentialsaddress':
          return (creds as unknown as { address(): { signature(): xdr.ScVal } }).address();
        case 'sorobancredentialsaddressv2':
          return (creds as unknown as { addressV2(): { signature(): xdr.ScVal } }).addressV2();
        case 'sorobancredentialsaddresswithdelegates':
          return (creds as unknown as { addressWithDelegates(): { addressCredentials(): { signature(): xdr.ScVal } } })
            .addressWithDelegates()
            .addressCredentials();
        default:
          return null;
      }
    })();
    if (!addressCreds) return false;
    const sigs = addressCreds.signature();
    if (sigs.switch().name === 'scvVoid') return false;
    try {
      const native = scValToNative(sigs);
      if (Array.isArray(native) && native.length > 0) return true;
      if (native && typeof native === 'object' && Object.keys(native).length > 0) return true;
    } catch {
      // ignore
    }
    return false;
  }

  private assertSmartWalletSignedMatches(
    unsignedXdr: string,
    signedXdr: string,
    actorAddress: string
  ): void {
    const unsignedTx = TransactionBuilder.fromXDR(unsignedXdr, this.config.networkPassphrase) as Transaction;
    const signedTx = TransactionBuilder.fromXDR(signedXdr, this.config.networkPassphrase) as Transaction;

    const unsigned = this.getHostFunctionOp(unsignedTx);
    const signed = this.getHostFunctionOp(signedTx);

    // Compare the transaction body without auth entries: source, sequence,
    // memo, preconditions, host function, and Soroban data must be identical.
    const unsignedAuth = unsigned.hostFn.auth();
    const signedAuth = signed.hostFn.auth();
    unsigned.hostFn.auth([]);
    signed.hostFn.auth([]);
    if (unsigned.innerTx.toXDR('base64') !== signed.innerTx.toXDR('base64')) {
      throw domainError('UNAUTHORIZED', 'Signed transaction body differs from prepared intent');
    }
    if (unsignedAuth.length !== signedAuth.length) {
      throw domainError('UNAUTHORIZED', 'Auth entry count changed');
    }

    for (let i = 0; i < unsignedAuth.length; i++) {
      const u = unsignedAuth[i];
      const s = signedAuth[i];
      const uAddr = this.authEntryAddress(u);
      const sAddr = this.authEntryAddress(s);
      if (uAddr !== sAddr) {
        throw domainError('UNAUTHORIZED', `Auth entry ${i} address changed`);
      }
      if (sAddr === actorAddress) {
        if (!this.isAddressBound(s)) {
          throw domainError('UNAUTHORIZED', `Actor auth entry ${i} is not address-bound`);
        }
        if (!this.hasAuthSignature(s)) {
          throw domainError('UNAUTHORIZED', `Actor auth entry ${i} is not signed`);
        }
      } else if (u.toXDR('base64') !== s.toXDR('base64')) {
        throw domainError('UNAUTHORIZED', `Non-actor auth entry ${i} was modified`);
      }
    }
  }
}
