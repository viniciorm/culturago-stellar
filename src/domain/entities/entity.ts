import { domainError } from '../errors';

export interface EntityVersion {
  version: number;
  metadataHash: string;
  hashSchema: number;
  registrarId: string;
  /** Server-issued intent timestamp. The on-chain ledger is tracked separately. */
  recordedAt: string;
  recordedLedger: number | null;
}

export interface EntityRecord {
  entityId: string;
  active: boolean;
  latestVersion: number;
  /** Immutable history: no operation ever mutates or deletes a past version. */
  versions: readonly EntityVersion[];
}

export interface EntityContentInput {
  metadataHash: string;
  hashSchema: number;
  registrarId: string;
  recordedAt: string;
}

function assertContent(input: EntityContentInput): void {
  if (!/^[0-9a-f]{64}$/.test(input.metadataHash)) {
    throw domainError('INVALID_INPUT', 'metadataHash must be a 64-char lowercase hex SHA-256');
  }
  if (!Number.isInteger(input.hashSchema) || input.hashSchema <= 0) {
    throw domainError('INVALID_INPUT', 'hashSchema must be a positive integer');
  }
  if (!input.registrarId) {
    throw domainError('INVALID_INPUT', 'registrarId is required');
  }
}

export function registerEntity(
  existing: EntityRecord | null,
  entityId: string,
  input: EntityContentInput
): EntityRecord {
  assertContent(input);
  if (existing) {
    const head = existing.versions[existing.latestVersion - 1];
    if (head.metadataHash === input.metadataHash && head.hashSchema === input.hashSchema) {
      return existing;
    }
    throw domainError('ALREADY_EXISTS', `Entity ${entityId} already registered with different content`);
  }
  return {
    entityId,
    active: true,
    latestVersion: 1,
    versions: [{ version: 1, ...input, recordedLedger: null }],
  };
}

export function versionEntity(
  record: EntityRecord,
  expectedVersion: number,
  input: EntityContentInput
): EntityRecord {
  assertContent(input);
  if (!record.active) {
    throw domainError('INACTIVE', `Entity ${record.entityId} is deactivated`);
  }
  if (expectedVersion !== record.latestVersion) {
    throw domainError(
      'VERSION_CONFLICT',
      `Expected version ${expectedVersion} but latest is ${record.latestVersion}`
    );
  }
  const next: EntityVersion = {
    version: record.latestVersion + 1,
    ...input,
    recordedLedger: null,
  };
  return {
    ...record,
    latestVersion: next.version,
    versions: [...record.versions, next],
  };
}

export function deactivateEntity(
  record: EntityRecord,
  expectedVersion: number
): EntityRecord {
  if (expectedVersion !== record.latestVersion) {
    throw domainError(
      'VERSION_CONFLICT',
      `Expected version ${expectedVersion} but latest is ${record.latestVersion}`
    );
  }
  if (!record.active) {
    return record;
  }
  return { ...record, active: false };
}

export function getEntityVersion(
  record: EntityRecord,
  version: number
): EntityVersion | null {
  return record.versions.find((v) => v.version === version) ?? null;
}
