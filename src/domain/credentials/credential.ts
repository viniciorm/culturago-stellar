import { domainError } from '../errors';
import { CredentialTypeCode, credentialTypeCode } from './catalog';

export type CredentialStatus = 'issued' | 'revoked';

export interface CredentialRecord {
  credentialId: string;
  credentialCode: string;
  /** Institutional issuer identity. A global role alone never suffices. */
  issuerId: string;
  /** Operator that signed, linked on-chain to `issuerId`. */
  issuedBy: string;
  subjectId: string;
  eventId: string;
  credentialType: CredentialTypeCode;
  metadataHash: string;
  hashSchema: number;
  status: CredentialStatus;
  /** Server-issued intent timestamp, set before any chain confirmation. */
  issuedIntentAt: string;
  /** Derived on-chain values, null until confirmed by readback. */
  issuedLedger: number | null;
  revokedLedger: number | null;
  revokedReasonHash: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
}

export interface IssueCredentialInput {
  credentialId: string;
  credentialCode: string;
  issuerId: string;
  issuedBy: string;
  subjectId: string;
  eventId: string;
  credentialType: string;
  metadataHash: string;
  hashSchema: number;
  /** Server clock, injected. Never derived from the browser. */
  issuedIntentAt: string;
}

/** Business uniqueness key: integrity hash is never a uniqueness substitute. */
export function credentialBusinessKey(input: {
  issuerId: string;
  subjectId: string;
  eventId: string;
  credentialType: number;
}): string {
  return `${input.issuerId}|${input.subjectId}|${input.eventId}|${input.credentialType}`;
}

function samePayload(a: CredentialRecord, input: IssueCredentialInput): boolean {
  return (
    a.credentialCode === input.credentialCode &&
    a.issuedBy === input.issuedBy &&
    a.metadataHash === input.metadataHash &&
    a.hashSchema === input.hashSchema
  );
}

/**
 * Builds a new credential record. If `existingForKey` is present:
 * identical payload returns it unchanged (idempotent), any difference is a conflict.
 */
export function buildCredential(
  existingForKey: CredentialRecord | null,
  input: IssueCredentialInput
): CredentialRecord {
  const type = credentialTypeCode(input.credentialType);
  if (!/^[0-9a-f]{64}$/.test(input.metadataHash)) {
    throw domainError('INVALID_INPUT', 'metadataHash must be a 64-char lowercase hex SHA-256');
  }
  if (!Number.isInteger(input.hashSchema) || input.hashSchema <= 0) {
    throw domainError('INVALID_INPUT', 'hashSchema must be a positive integer');
  }
  if (input.issuerId === input.subjectId) {
    throw domainError('INVALID_INPUT', 'Issuer and subject must differ');
  }
  if (!input.eventId) {
    throw domainError('INVALID_INPUT', 'eventId is required');
  }

  if (existingForKey) {
    if (samePayload(existingForKey, input)) {
      return existingForKey;
    }
    throw domainError(
      'ALREADY_EXISTS',
      'A credential already exists for this issuer, subject, event and type'
    );
  }

  return {
    credentialId: input.credentialId,
    credentialCode: input.credentialCode,
    issuerId: input.issuerId,
    issuedBy: input.issuedBy,
    subjectId: input.subjectId,
    eventId: input.eventId,
    credentialType: type,
    metadataHash: input.metadataHash,
    hashSchema: input.hashSchema,
    status: 'issued',
    issuedIntentAt: input.issuedIntentAt,
    issuedLedger: null,
    revokedLedger: null,
    revokedReasonHash: null,
    revokedAt: null,
    revokedBy: null,
  };
}

/**
 * Revocation preserves the record and never touches other credentials.
 * Same-reason repeat is an idempotent success; a different reason conflicts.
 */
export function revokeCredential(
  record: CredentialRecord,
  input: { operatorId: string; reasonHash: string | null; revokedAt: string }
): CredentialRecord {
  if (record.status === 'revoked') {
    if (record.revokedReasonHash === input.reasonHash) {
      return record;
    }
    throw domainError('ALREADY_REVOKED', `Credential ${record.credentialId} already revoked`);
  }
  return {
    ...record,
    status: 'revoked',
    revokedReasonHash: input.reasonHash,
    revokedAt: input.revokedAt,
    revokedBy: input.operatorId,
  };
}

export function verifyCredentialPayload(
  record: CredentialRecord | null,
  metadataHash: string,
  hashSchema: number
): { valid: boolean; reason: 'ok' | 'not_found' | 'hash_mismatch' | 'revoked' } {
  if (!record) return { valid: false, reason: 'not_found' };
  if (record.metadataHash !== metadataHash || record.hashSchema !== hashSchema) {
    return { valid: false, reason: 'hash_mismatch' };
  }
  if (record.status === 'revoked') return { valid: false, reason: 'revoked' };
  return { valid: true, reason: 'ok' };
}
