import { createHash } from 'crypto';
import { domainError } from '../../domain/errors';
import {
  ContractArgValue,
  ContractCallSpec,
  SimulationOutcome,
  SorobanTransport,
  TransactionStatusResult,
} from '../../ports/SorobanTransport';

function hexOf(arg: ContractArgValue): string {
  if (arg.kind !== 'bytes32') throw domainError('INVALID_INPUT', 'expected bytes32 argument');
  return arg.hex;
}

function u32Of(arg: ContractArgValue): number {
  if (arg.kind !== 'u32') throw domainError('INVALID_INPUT', 'expected u32 argument');
  return arg.value;
}

function optHexOf(arg: ContractArgValue): string | null {
  if (arg.kind !== 'optional_bytes32') {
    throw domainError('INVALID_INPUT', 'expected optional bytes32 argument');
  }
  return arg.hex;
}

interface ChainEntityHead {
  entityId: string;
  latestVersion: number;
  active: boolean;
  metadataHash: string;
  hashSchema: number;
  ledger: number;
}

interface ChainCredential {
  credentialId: string;
  tokenId: number;
  issuerId: string;
  subjectId: string;
  eventId: string;
  credentialType: number;
  metadataHash: string;
  hashSchema: number;
  revoked: boolean;
  revokedReasonHash: string | null;
  revokedLedger: number | null;
  issuedLedger: number;
  issuedBy: string;
}

/**
 * Faithful in-memory chain: models the domain contract semantics (idempotent
 * registration, monotonic token ids, business-key uniqueness, revocable
 * attestations) so MockStellarGateway exercises the SAME gateway pipeline as
 * the real one. XDR payloads are opaque JSON envelopes; "signing" appends a
 * deterministic signature marker — verifySignedMatches still enforces that
 * the signed payload corresponds byte-for-byte to the prepared one.
 */
export class InMemoryChainTransport implements SorobanTransport {
  private ledger = 1000;
  private entities = new Map<string, ChainEntityHead>();
  private entityVersions = new Map<string, Map<number, { metadataHash: string; hashSchema: number }>>();
  private credentials = new Map<string, ChainCredential>();
  private tokenCounter = 0;
  private businessKeys = new Map<string, string>();
  private pending = new Map<string, { status: 'PENDING' | 'SUCCESS' | 'FAILED'; ledger: number }>();
  /** Test hook: make the next submission stay PENDING (timeout scenario). */
  public nextSubmissionStaysPending = false;
  /** Test hook: make the next poll return SUCCESS with a null ledger. */
  public nextPollReturnsNullLedger = false;

  async simulate(spec: ContractCallSpec): Promise<SimulationOutcome> {
    const error = this.validate(spec);
    return {
      needsRestore: false,
      preparedXdr: error ? '' : this.encodeEnvelope(spec, 'unsigned'),
      latestLedger: this.ledger,
      contractError: error,
    };
  }

  async submit(signedXdr: string): Promise<{ txHash: string }> {
    const { spec, signature } = this.decodeEnvelope(signedXdr);
    if (!signature) {
      throw domainError('INVALID_INPUT', 'submitted payload is not signed');
    }
    const txHash = createHash('sha256').update(signedXdr).digest('hex');
    const error = this.validate(spec);
    const ledger = ++this.ledger;
    if (error) {
      this.pending.set(txHash, { status: 'FAILED', ledger });
    } else {
      this.apply(spec);
      const status = this.nextSubmissionStaysPending ? 'PENDING' : 'SUCCESS';
      this.nextSubmissionStaysPending = false;
      this.pending.set(txHash, { status, ledger });
    }
    return { txHash };
  }

  async pollTransaction(txHash: string): Promise<TransactionStatusResult> {
    const entry = this.pending.get(txHash);
    if (!entry) return { status: 'NOT_FOUND' };
    if (entry.status === 'PENDING') return { status: 'PENDING' };
    if (entry.status === 'FAILED') return { status: 'FAILED', contractError: 'CONTRACT_FAILED' };
    if (this.nextPollReturnsNullLedger) {
      this.nextPollReturnsNullLedger = false;
      return { status: 'SUCCESS', ledger: null };
    }
    return { status: 'SUCCESS', ledger: entry.ledger };
  }

  async readback(spec: ContractCallSpec): Promise<unknown> {
    const first = spec.args.find((a) => a.kind === 'bytes32');
    const key = first && first.kind === 'bytes32' ? first.hex : null;
    if (!key) return null;

    if (spec.method === 'get_entity') {
      const head = this.entities.get(key);
      if (!head) return null;
      return {
        entity_id: head.entityId,
        latest_version: head.latestVersion,
        active: head.active,
        metadata_hash: head.metadataHash,
        hash_schema: head.hashSchema,
        matches: true,
      };
    }

    if (spec.method === 'verify_entity') {
      const entityId = hexOf(spec.args[0]);
      const version = u32Of(spec.args[1]);
      const metadataHash = hexOf(spec.args[2]);
      const hashSchema = u32Of(spec.args[3]);
      const head = this.entities.get(entityId);
      if (!head || !head.active) return false;
      if (version < 1 || version > head.latestVersion) return false;
      const v = this.entityVersions.get(entityId)?.get(version);
      if (!v) return false;
      return v.metadataHash === metadataHash && v.hashSchema === hashSchema;
    }

    if (spec.method === 'get_credential') {
      const record = this.credentials.get(key);
      if (!record) return null;
      return {
        credential_id: record.credentialId,
        token_id: record.tokenId,
        issuer_id: record.issuerId,
        issued_by: record.issuedBy,
        subject_id: record.subjectId,
        event_id: record.eventId,
        credential_type: record.credentialType,
        metadata_hash: record.metadataHash,
        hash_schema: record.hashSchema,
        revoked: record.revoked,
        issued_ledger: record.issuedLedger,
        revoked_ledger: record.revokedLedger,
        revoked_reason_hash: record.revokedReasonHash,
        matches: true,
      };
    }

    if (spec.method === 'verify_credential') {
      const credentialId = hexOf(spec.args[0]);
      const metadataHash = hexOf(spec.args[1]);
      const hashSchema = u32Of(spec.args[2]);
      const record = this.credentials.get(credentialId);
      if (!record) return false;
      return (
        !record.revoked &&
        record.metadataHash === metadataHash &&
        record.hashSchema === hashSchema
      );
    }

    return null;
  }

  async enforcingSimulateAndAssemble(signedXdr: string): Promise<SimulationOutcome> {
    // The in-memory transport does not model auth entry validation, but it
    // validates the underlying spec. The returned XDR is the same fake envelope
    // because tests using this transport do not run fee-payer signature logic.
    const { spec, signature } = this.decodeEnvelope(signedXdr);
    if (!signature) {
      return {
        needsRestore: false,
        preparedXdr: '',
        latestLedger: this.ledger,
        contractError: 'UNAUTHORIZED',
      };
    }
    const error = this.validate(spec);
    return {
      needsRestore: false,
      preparedXdr: signedXdr,
      latestLedger: this.ledger,
      contractError: error,
    };
  }

  async verifySignedMatches(unsignedXdr: string, signedXdr: string): Promise<boolean> {
    try {
      const unsigned = this.decodeEnvelope(unsignedXdr);
      const signed = this.decodeEnvelope(signedXdr);
      if (unsigned.signature !== null || signed.signature === null) return false;
      return JSON.stringify(unsigned.spec) === JSON.stringify(signed.spec);
    } catch {
      return false;
    }
  }

  // ---------- domain semantics (mirror of the Soroban contracts) ----------

  private validate(spec: ContractCallSpec): string | null {
    switch (spec.method) {
      case 'register_entity': {
        const entityId = hexOf(spec.args[1]);
        const metadataHash = hexOf(spec.args[2]);
        const hashSchema = u32Of(spec.args[3]);
        if (hashSchema !== 1) return 'INVALID_INPUT';
        const head = this.entities.get(entityId);
        if (head && (head.metadataHash !== metadataHash || head.hashSchema !== 1)) {
          return 'ALREADY_EXISTS';
        }
        return null;
      }
      case 'issue_credential': {
        const credentialId = hexOf(spec.args[1]);
        const issuerId = hexOf(spec.args[2]);
        const subjectId = hexOf(spec.args[3]);
        const eventId = hexOf(spec.args[4]);
        const credentialType = u32Of(spec.args[5]);
        const hashSchema = u32Of(spec.args[7]);
        if (hashSchema !== 1) return 'INVALID_INPUT';
        if (credentialType < 1 || credentialType > 6) return 'UNKNOWN_CREDENTIAL_TYPE';
        if (this.credentials.has(credentialId)) return null; // idempotent resend
        const bk = `${issuerId}|${subjectId}|${eventId}|${credentialType}`;
        if (this.businessKeys.has(bk)) return 'ALREADY_EXISTS';
        return null;
      }
      case 'revoke_credential': {
        const credentialId = hexOf(spec.args[1]);
        const reasonHex = optHexOf(spec.args[2]);
        const record = this.credentials.get(credentialId);
        if (!record) return 'NOT_FOUND';
        if (record.revoked) {
          if (record.revokedReasonHash !== reasonHex) return 'ALREADY_EXISTS';
          return null;
        }
        return null;
      }
      default:
        return 'INVALID_INPUT';
    }
  }

  private apply(spec: ContractCallSpec): void {
    switch (spec.method) {
      case 'register_entity': {
        const id = hexOf(spec.args[1]);
        const metadataHash = hexOf(spec.args[2]);
        const hashSchema = u32Of(spec.args[3]);
        if (!this.entities.has(id)) {
          this.entities.set(id, {
            entityId: id,
            latestVersion: 1,
            active: true,
            metadataHash,
            hashSchema,
            ledger: this.ledger,
          });
          const versions = new Map<number, { metadataHash: string; hashSchema: number }>();
          versions.set(1, { metadataHash, hashSchema });
          this.entityVersions.set(id, versions);
        }
        return;
      }
      case 'issue_credential': {
        const cid = hexOf(spec.args[1]);
        if (this.credentials.has(cid)) return;
        const credentialType = u32Of(spec.args[5]);
        const bk = `${hexOf(spec.args[2])}|${hexOf(spec.args[3])}|${hexOf(spec.args[4])}|${credentialType}`;
        this.businessKeys.set(bk, cid);
        this.credentials.set(cid, {
          credentialId: cid,
          tokenId: ++this.tokenCounter,
          issuerId: hexOf(spec.args[2]),
          subjectId: hexOf(spec.args[3]),
          eventId: hexOf(spec.args[4]),
          credentialType,
          metadataHash: hexOf(spec.args[6]),
          hashSchema: u32Of(spec.args[7]),
          revoked: false,
          revokedReasonHash: null,
          revokedLedger: null,
          issuedLedger: this.ledger,
          issuedBy: (spec.args[0] as { kind: 'address'; address: string }).address,
        });
        return;
      }
      case 'revoke_credential': {
        const record = this.credentials.get(hexOf(spec.args[1]));
        if (record && !record.revoked) {
          record.revoked = true;
          record.revokedReasonHash = optHexOf(spec.args[2]);
          record.revokedLedger = this.ledger;
        }
        return;
      }
    }
  }


  private encodeEnvelope(spec: ContractCallSpec, mode: 'unsigned'): string {
    return JSON.stringify({ v: 1, mode, signature: null, spec });
  }

  private decodeEnvelope(xdrLike: string): {
    spec: ContractCallSpec;
    signature: string | null;
  } {
    const parsed = JSON.parse(xdrLike) as { spec: ContractCallSpec; signature: string | null };
    return { spec: parsed.spec, signature: parsed.signature ?? null };
  }
}
