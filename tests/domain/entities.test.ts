import { describe, expect, it } from 'vitest';
import {
  deactivateEntity,
  getEntityVersion,
  registerEntity,
  versionEntity,
} from '@/domain/entities/entity';

const HASH_1 = '1'.repeat(64);
const HASH_2 = '2'.repeat(64);

const input = (hash: string) => ({
  metadataHash: hash,
  hashSchema: 1,
  registrarId: 'registrar-1',
  recordedAt: '2026-03-01T12:00:00Z',
});

describe('entity registry rules', () => {
  it('register creates version 1', () => {
    const record = registerEntity(null, 'entity-1', input(HASH_1));
    expect(record.latestVersion).toBe(1);
    expect(record.active).toBe(true);
    expect(record.versions).toHaveLength(1);
    expect(record.versions[0].metadataHash).toBe(HASH_1);
  });

  it('repeated registration with identical content is idempotent', () => {
    const first = registerEntity(null, 'entity-1', input(HASH_1));
    const second = registerEntity(first, 'entity-1', input(HASH_1));
    expect(second).toBe(first);
  });

  it('registration with different content conflicts', () => {
    const first = registerEntity(null, 'entity-1', input(HASH_1));
    expect(() => registerEntity(first, 'entity-1', input(HASH_2))).toThrowError(
      expect.objectContaining({ code: 'ALREADY_EXISTS' })
    );
  });

  it('versions with optimistic control and never rewrites history', () => {
    let record = registerEntity(null, 'entity-1', input(HASH_1));
    record = versionEntity(record, 1, input(HASH_2));
    expect(record.latestVersion).toBe(2);
    expect(record.versions).toHaveLength(2);
    expect(getEntityVersion(record, 1)!.metadataHash).toBe(HASH_1);
    expect(getEntityVersion(record, 2)!.metadataHash).toBe(HASH_2);
  });

  it('rejects stale expected_version', () => {
    const record = registerEntity(null, 'entity-1', input(HASH_1));
    expect(() => versionEntity(record, 7, input(HASH_2))).toThrowError(
      expect.objectContaining({ code: 'VERSION_CONFLICT' })
    );
  });

  it('deactivation preserves history and blocks further versioning', () => {
    let record = registerEntity(null, 'entity-1', input(HASH_1));
    record = versionEntity(record, 1, input(HASH_2));
    record = deactivateEntity(record, 2);
    expect(record.active).toBe(false);
    expect(record.versions).toHaveLength(2);
    expect(() => versionEntity(record, 2, input(HASH_1))).toThrowError(
      expect.objectContaining({ code: 'INACTIVE' })
    );
  });

  it('deactivating twice with matching version is idempotent', () => {
    let record = registerEntity(null, 'entity-1', input(HASH_1));
    record = deactivateEntity(record, 1);
    expect(deactivateEntity(record, 1)).toBe(record);
    expect(() => deactivateEntity(record, 3)).toThrowError(
      expect.objectContaining({ code: 'VERSION_CONFLICT' })
    );
  });

  it('rejects malformed hashes', () => {
    expect(() =>
      registerEntity(null, 'entity-1', { ...input('not-a-hash') })
    ).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });
});
