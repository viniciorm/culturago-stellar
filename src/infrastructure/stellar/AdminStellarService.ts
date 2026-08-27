import 'server-only';
import { randomUUID } from 'crypto';
import { assertTransition } from '../../domain/operations/operationState';
import { domainError } from '../../domain/errors';
import { CanonicalHashPort } from '../../ports/CanonicalHashPort';
import { OperationStore, StoredOperation } from '../../ports/OperationStore';
import {
  ContractArgValue,
  ContractCallSpec,
  SorobanTransport,
  TransactionStatusResult,
} from '../../ports/SorobanTransport';
import { OperationState } from '../../ports/StellarGateway';
import { SdkSorobanTransport } from './SdkSorobanTransport';
import { LocalSigner } from './LocalSigner';
import { getTestnetAdminSignerConfig, StellarNetworkConfig } from './networkConfig';

export const ADMIN_PROVISION_OPERATIONS = [
  'grant_issuer',
  'grant_revoker',
  'grant_registrar',
  'revoke_issuer',
  'revoke_revoker',
  'revoke_registrar',
  'link_issuer_operator',
  'unlink_issuer_operator',
] as const;

export type AdminProvisionOperation = (typeof ADMIN_PROVISION_OPERATIONS)[number];

export interface AdminProvisionRequest {
  /** On-chain smart-wallet or G-address of the operator being provisioned. */
  operatorAddress: string;
  /** Domain UUID of the issuer the operator will act on behalf of. */
  issuerEntityId: string;
  /** Allowlisted operations to execute in order. */
  operations: AdminProvisionOperation[];
}

export interface AdminProvisionResult {
  operation: AdminProvisionOperation;
  operationId: string;
  txHash: string | null;
  phase: OperationState['phase'];
  errorCode: string | null;
}

function assertHex32(value: string, field: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw domainError('INVALID_INPUT', `${field} must be a 64-char lowercase hex digest`);
  }
}

function bytes32(hex: string): ContractArgValue {
  return { kind: 'bytes32', hex };
}

function address(addr: string): ContractArgValue {
  return { kind: 'address', address: addr };
}

/**
 * Server-side, testnet-only provisioning service for contract admin actions.
 * It signs with a testnet G-account (never a user secret), stores durable
 * operation records, polls and readbacks, and audits without logging signed
 * XDR or secrets. Mainnet is hard-failed.
 */
export class AdminStellarService {
  private readonly transport: SorobanTransport;
  private readonly allowedOps: ReadonlySet<AdminProvisionOperation> = new Set(
    ADMIN_PROVISION_OPERATIONS
  );

  constructor(
    private readonly config: StellarNetworkConfig,
    private readonly store: OperationStore,
    private readonly canonicalHash: CanonicalHashPort,
    private readonly signer: LocalSigner,
    private readonly newId: () => string = () => randomUUID()
  ) {
    this.transport = new SdkSorobanTransport(config);
  }

  async provision(request: AdminProvisionRequest): Promise<AdminProvisionResult[]> {
    const { operatorAddress, issuerEntityId, operations } = request;

    if (operations.length === 0) {
      throw domainError('INVALID_INPUT', 'operations list is empty');
    }
    for (const op of operations) {
      if (!this.allowedOps.has(op)) {
        throw domainError('INVALID_INPUT', `operation ${op} is not in the admin allowlist`);
      }
    }

    const issuerHash = await this.canonicalHash.hashDocument(
      'culturago.entity.v1',
      issuerEntityId
    );
    assertHex32(issuerHash, 'issuerHash');

    const results: AdminProvisionResult[] = [];
    for (const op of operations) {
      results.push(await this.execute(op, operatorAddress, issuerHash));
    }
    return results;
  }

  private async execute(
    operation: AdminProvisionOperation,
    operatorAddress: string,
    issuerHash: string
  ): Promise<AdminProvisionResult> {
    const idempotencyKey = this.idempotencyKey(operation, operatorAddress, issuerHash);
    const command = { operation, operatorAddress, issuerHash };
    const fingerprint = await this.canonicalHash.hashDocument(
      'culturago.fingerprint.v1',
      command
    );

    const existing = await this.store.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.intent.fingerprint !== fingerprint) {
        throw domainError('ALREADY_EXISTS', 'idempotency key reused with a different payload');
      }
      return this.toResult(existing);
    }

    const operationId = this.newId();
    const record = this.createRecord(operationId, idempotencyKey, fingerprint, operation, operatorAddress, issuerHash);
    await this.store.create(record);

    const { spec, readbackSpec, expectedReadback } = this.buildSpecs(
      operation,
      operatorAddress,
      issuerHash
    );

    try {
      assertTransition(record.state.phase, 'confirming');
      record.state.phase = 'confirming';
      await this.store.save(record);

      const txHash = await this.submitWithRestore(spec);
      record.state.txHash = txHash;
      await this.store.save(record);

      const poll = await this.transport.pollTransaction(txHash);
      await this.finalize(record, poll, readbackSpec, expectedReadback);
      await this.store.save(record);

      // Audit line: no signed XDR, no secret, no prepared XDR.
      console.log('[ADMIN_PROVISION]', {
        actor: 'admin',
        adminAddress: this.signer.publicKey,
        operationId,
        operation,
        operatorAddress,
        issuerHash,
        txHash,
        phase: record.state.phase,
        errorCode: record.state.errorCode,
        ledger: record.state.ledger,
      });

      return this.toResult(record);
    } catch (error) {
      record.state.phase = 'failed_terminal';
      record.state.errorCode = error instanceof Error ? error.message : 'PROVISION_FAILED';
      await this.store.save(record);
      console.log('[ADMIN_PROVISION] failed:', {
        operationId,
        operation,
        operatorAddress,
        issuerHash,
        error: record.state.errorCode,
      });
      throw error;
    }
  }

  private async submitWithRestore(spec: ContractCallSpec): Promise<string> {
    let sim = await this.transport.simulate(spec);

    if (sim.needsRestore) {
      const restoreSigned = await this.signer.sign({
        operationId: this.newId(),
        networkPassphrase: this.config.networkPassphrase,
        unsignedXdr: sim.preparedXdr,
        preparedAtLedger: sim.latestLedger,
        intentFingerprint: '',
        spec,
      });
      const { txHash: restoreTxHash } = await this.transport.submit(restoreSigned.signedXdr);
      const restorePoll = await this.transport.pollTransaction(restoreTxHash);
      if (restorePoll.status !== 'SUCCESS') {
        throw domainError(
          'INVALID_STATE_TRANSITION',
          `restore transaction failed: ${restorePoll.status}`
        );
      }
      sim = await this.transport.simulate(spec);
      if (sim.contractError) {
        throw domainError('INVALID_STATE_TRANSITION', `re-simulation failed: ${sim.contractError}`);
      }
    }

    if (sim.contractError) {
      throw domainError('INVALID_STATE_TRANSITION', `simulation failed: ${sim.contractError}`);
    }

    const signed = await this.signer.sign({
      operationId: this.newId(),
      networkPassphrase: this.config.networkPassphrase,
      unsignedXdr: sim.preparedXdr,
      preparedAtLedger: sim.latestLedger,
      intentFingerprint: '',
      spec,
    });

    const { txHash } = await this.transport.submit(signed.signedXdr);
    return txHash;
  }

  private async finalize(
    record: StoredOperation,
    poll: TransactionStatusResult,
    readbackSpec: ContractCallSpec | null,
    expectedReadback: boolean | null
  ): Promise<void> {
    assertTransition(record.state.phase, 'confirming');

    if (poll.status === 'SUCCESS') {
      record.state.ledger = poll.ledger ?? null;
      const readbackOk = await this.verifyReadback(readbackSpec, expectedReadback);
      if (readbackOk) {
        assertTransition(record.state.phase, 'confirmed');
        record.state.phase = 'confirmed';
        record.state.errorCode = null;
      } else {
        assertTransition(record.state.phase, 'failed_terminal');
        record.state.phase = 'failed_terminal';
        record.state.errorCode = 'READBACK_MISMATCH';
      }
      return;
    }

    if (poll.status === 'FAILED') {
      assertTransition(record.state.phase, 'failed_terminal');
      record.state.phase = 'failed_terminal';
      record.state.errorCode = poll.contractError ?? 'CONTRACT_FAILED';
      return;
    }

    // PENDING / NOT_FOUND: the network has not finalised yet.
    assertTransition(record.state.phase, 'unknown');
    record.state.phase = 'unknown';
    record.state.errorCode = 'PENDING_TIMEOUT';
  }

  private async verifyReadback(
    readbackSpec: ContractCallSpec | null,
    expected: boolean | null
  ): Promise<boolean> {
    if (!readbackSpec || expected === null) {
      // Contract does not expose role readback; ledger success is the only
      // available evidence for grant/revoke operations.
      return true;
    }
    const raw = await this.transport.readback(readbackSpec);
    if (raw === null) return false;
    return raw === expected;
  }

  private buildSpecs(
    operation: AdminProvisionOperation,
    operatorAddress: string,
    issuerHash: string
  ): {
    spec: ContractCallSpec;
    readbackSpec: ContractCallSpec | null;
    expectedReadback: boolean | null;
  } {
    const admin = this.signer.publicKey;
    const credential = this.config.credentialRegistryContractId;
    const entity = this.config.entityRegistryContractId;
    const base: Omit<ContractCallSpec, 'contractId' | 'method' | 'args'> = {
      actorAddress: admin,
      feePayerAddress: undefined,
    };

    switch (operation) {
      case 'grant_issuer':
        return {
          spec: { ...base, contractId: credential, method: 'grant_issuer', args: [address(admin), address(operatorAddress)] },
          readbackSpec: null,
          expectedReadback: null,
        };
      case 'grant_revoker':
        return {
          spec: { ...base, contractId: credential, method: 'grant_revoker', args: [address(admin), address(operatorAddress)] },
          readbackSpec: null,
          expectedReadback: null,
        };
      case 'grant_registrar':
        return {
          spec: { ...base, contractId: entity, method: 'grant_registrar', args: [address(admin), address(operatorAddress)] },
          readbackSpec: null,
          expectedReadback: null,
        };
      case 'revoke_issuer':
        return {
          spec: { ...base, contractId: credential, method: 'revoke_issuer', args: [address(admin), address(operatorAddress)] },
          readbackSpec: null,
          expectedReadback: null,
        };
      case 'revoke_revoker':
        return {
          spec: { ...base, contractId: credential, method: 'revoke_revoker', args: [address(admin), address(operatorAddress)] },
          readbackSpec: null,
          expectedReadback: null,
        };
      case 'revoke_registrar':
        return {
          spec: { ...base, contractId: entity, method: 'revoke_registrar', args: [address(admin), address(operatorAddress)] },
          readbackSpec: null,
          expectedReadback: null,
        };
      case 'link_issuer_operator':
        return {
          spec: { ...base, contractId: credential, method: 'link_issuer_operator', args: [bytes32(issuerHash), address(operatorAddress)] },
          readbackSpec: { ...base, contractId: credential, method: 'is_issuer_operator', args: [bytes32(issuerHash), address(operatorAddress)] },
          expectedReadback: true,
        };
      case 'unlink_issuer_operator':
        return {
          spec: { ...base, contractId: credential, method: 'unlink_issuer_operator', args: [bytes32(issuerHash), address(operatorAddress)] },
          readbackSpec: { ...base, contractId: credential, method: 'is_issuer_operator', args: [bytes32(issuerHash), address(operatorAddress)] },
          expectedReadback: false,
        };
    }
  }

  private createRecord(
    operationId: string,
    idempotencyKey: string,
    fingerprint: string,
    operation: AdminProvisionOperation,
    operatorAddress: string,
    issuerHash: string
  ): StoredOperation {
    const state: OperationState = {
      operationId,
      idempotencyKey,
      phase: 'submitted',
      txHash: null,
      ledger: null,
      errorCode: null,
    };
    return {
      state,
      intent: {
        kind: 'admin_provision',
        actorAddress: this.signer.publicKey,
        fingerprint,
        subjectKey: `${operation}:${operatorAddress}:${issuerHash}`,
        prepared: null,
        signed: null,
      },
    };
  }

  private idempotencyKey(operation: AdminProvisionOperation, operatorAddress: string, issuerHash: string): string {
    return `admin:${operation}:${operatorAddress}:${issuerHash}`;
  }

  private toResult(record: StoredOperation): AdminProvisionResult {
    const operation = record.intent.subjectKey.split(':')[0] as AdminProvisionOperation;
    return {
      operation,
      operationId: record.state.operationId,
      txHash: record.state.txHash,
      phase: record.state.phase,
      errorCode: record.state.errorCode,
    };
  }
}

/**
 * Factory for the testnet-only admin provisioning service.
 * Hard-fails on mainnet and demo via getTestnetAdminSignerConfig.
 */
export function createAdminStellarService(
  networkConfig: StellarNetworkConfig,
  store: OperationStore,
  canonicalHash: CanonicalHashPort
): AdminStellarService {
  const adminConfig = getTestnetAdminSignerConfig();
  const signer = new LocalSigner(adminConfig.adminSecret, networkConfig.networkPassphrase);
  if (signer.publicKey !== adminConfig.adminAddress) {
    throw domainError('INVALID_INPUT', 'testnet admin signer public key mismatch');
  }
  return new AdminStellarService(networkConfig, store, canonicalHash, signer);
}
