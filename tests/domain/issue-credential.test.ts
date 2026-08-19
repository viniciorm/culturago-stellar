import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryDatabaseGateway } from '../fixtures/inMemoryDatabaseGateway';
import { issueCredential, IssueCredentialCommand } from '@/application/use-cases/issue-credential';
import { revokeCredential, verifyCredential } from '@/application/use-cases/revoke-credential';
import {
  checkInParticipation,
  confirmParticipation,
  registerParticipation,
} from '@/application/use-cases/manage-participation';
import { isDomainError } from '@/domain/errors';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

let db: InMemoryDatabaseGateway;
let idCounter: number;
let clock: number;

const deps = () => ({
  db,
  newId: () => `cred-${++idCounter}`,
  now: () => new Date(Date.UTC(2026, 2, 1, 12, clock++)).toISOString(),
});

const baseCommand: IssueCredentialCommand = {
  issuerId: 'org-fdvc',
  operatorId: 'operator-1',
  subjectId: 'dancer-1',
  eventId: 'fdvc-2026',
  credentialType: 'dancer_participant',
  credentialCode: 'CRED-FDVC26-DCR-DANC-001',
  metadataHash: HASH_A,
  hashSchema: 2,
};

async function confirmDancer(eventId: string) {
  await registerParticipation(deps(), { subjectId: 'dancer-1', eventId, actorId: 'staff' });
  const checked = await checkInParticipation(deps(), { subjectId: 'dancer-1', eventId, actorId: 'staff' });
  expect(checked.state).toBe('checked_in');
  await confirmParticipation(deps(), { subjectId: 'dancer-1', eventId, actorId: 'organizer-1' });
}

beforeEach(() => {
  db = new InMemoryDatabaseGateway();
  idCounter = 0;
  clock = 0;
  db.addLink({ issuerId: 'org-fdvc', operatorId: 'operator-1', active: true });
});

describe('issue credential', () => {
  it('issues a credential once participation is confirmed', async () => {
    await confirmDancer('fdvc-2026');
    const cred = await issueCredential(deps(), baseCommand);
    expect(cred.status).toBe('issued');
    expect(cred.issuerId).toBe('org-fdvc');
    expect(cred.issuedBy).toBe('operator-1');
    expect(cred.eventId).toBe('fdvc-2026');
    expect(cred.credentialType).toBe(1);
    expect(cred.issuedLedger).toBeNull();
  });

  it('rejects an operator with no institutional link even if they hold a role elsewhere', async () => {
    await confirmDancer('fdvc-2026');
    db.addLink({ issuerId: 'org-other', operatorId: 'operator-2', active: true });
    await expect(
      issueCredential(deps(), { ...baseCommand, operatorId: 'operator-2' })
    ).rejects.toMatchObject({ code: 'ISSUER_OPERATOR_NOT_LINKED' });
  });

  it('rejects an inactive link', async () => {
    await confirmDancer('fdvc-2026');
    db.addLink({ issuerId: 'org-fdvc', operatorId: 'operator-3', active: false });
    await expect(
      issueCredential(deps(), { ...baseCommand, operatorId: 'operator-3' })
    ).rejects.toMatchObject({ code: 'ISSUER_OPERATOR_NOT_LINKED' });
  });

  it('requires confirmed participation: participant_of alone is not enough', async () => {
    await expect(issueCredential(deps(), baseCommand)).rejects.toMatchObject({
      code: 'PARTICIPATION_NOT_CONFIRMED',
    });
  });

  it('rejects unknown credential types', async () => {
    await confirmDancer('fdvc-2026');
    await expect(
      issueCredential(deps(), { ...baseCommand, credentialType: 'noble_knight' })
    ).rejects.toMatchObject({ code: 'UNKNOWN_CREDENTIAL_TYPE' });
  });

  it('enforces the unique business key issuer+subject+event+type', async () => {
    await confirmDancer('fdvc-2026');
    await issueCredential(deps(), baseCommand);
    await expect(
      issueCredential(deps(), { ...baseCommand, metadataHash: HASH_B })
    ).rejects.toMatchObject({ code: 'ALREADY_EXISTS' });
  });

  it('is idempotent when the exact same payload is resubmitted', async () => {
    await confirmDancer('fdvc-2026');
    const first = await issueCredential(deps(), baseCommand);
    const second = await issueCredential(deps(), baseCommand);
    expect(second.credentialId).toBe(first.credentialId);
    expect(db.credentials.size).toBe(1);
  });

  it('event A and event B produce independent credentials for the same subject', async () => {
    await confirmDancer('fdvc-2026');
    await confirmDancer('fdvc-2027');
    const a = await issueCredential(deps(), baseCommand);
    const b = await issueCredential(deps(), {
      ...baseCommand,
      eventId: 'fdvc-2027',
      credentialCode: 'CRED-FDVC27-DCR-DANC-001',
    });
    expect(a.credentialId).not.toBe(b.credentialId);
    expect(db.credentials.size).toBe(2);
  });
});

describe('revoke and verify credential', () => {
  it('revoking A never alters B', async () => {
    await confirmDancer('fdvc-2026');
    await confirmDancer('fdvc-2027');
    const a = await issueCredential(deps(), baseCommand);
    const b = await issueCredential(deps(), {
      ...baseCommand,
      eventId: 'fdvc-2027',
      credentialCode: 'CRED-FDVC27-DCR-DANC-001',
      metadataHash: HASH_B,
    });

    const revokedA = await revokeCredential(deps(), {
      credentialId: a.credentialId,
      operatorId: 'operator-1',
      reasonHash: 'c'.repeat(64),
    });
    expect(revokedA.status).toBe('revoked');
    expect(revokedA.revokedAt).not.toBeNull();

    const stillB = await db.getCredentialById(b.credentialId);
    expect(stillB!.status).toBe('issued');
  });

  it('same-reason revocation is idempotent, different reason conflicts', async () => {
    await confirmDancer('fdvc-2026');
    const cred = await issueCredential(deps(), baseCommand);
    const reason = 'd'.repeat(64);
    await revokeCredential(deps(), { credentialId: cred.credentialId, operatorId: 'operator-1', reasonHash: reason });

    const again = await revokeCredential(deps(), { credentialId: cred.credentialId, operatorId: 'operator-1', reasonHash: reason });
    expect(again.status).toBe('revoked');

    try {
      await revokeCredential(deps(), { credentialId: cred.credentialId, operatorId: 'operator-1', reasonHash: 'e'.repeat(64) });
      expect.unreachable();
    } catch (e) {
      expect(isDomainError(e, 'ALREADY_REVOKED')).toBe(true);
    }
  });

  it('rejects revocation by an operator not linked to the issuer', async () => {
    await confirmDancer('fdvc-2026');
    const cred = await issueCredential(deps(), baseCommand);
    await expect(
      revokeCredential(deps(), { credentialId: cred.credentialId, operatorId: 'stranger', reasonHash: null })
    ).rejects.toMatchObject({ code: 'ISSUER_OPERATOR_NOT_LINKED' });
  });

  it('verification distinguishes ok, mismatch and revoked', async () => {
    await confirmDancer('fdvc-2026');
    const cred = await issueCredential(deps(), baseCommand);

    expect(await verifyCredential({ db }, { credentialId: cred.credentialId, metadataHash: HASH_A, hashSchema: 2 }))
      .toEqual({ valid: true, reason: 'ok' });
    expect(await verifyCredential({ db }, { credentialId: cred.credentialId, metadataHash: HASH_B, hashSchema: 2 }))
      .toEqual({ valid: false, reason: 'hash_mismatch' });

    await revokeCredential(deps(), { credentialId: cred.credentialId, operatorId: 'operator-1', reasonHash: null });
    expect(await verifyCredential({ db }, { credentialId: cred.credentialId, metadataHash: HASH_A, hashSchema: 2 }))
      .toEqual({ valid: false, reason: 'revoked' });
  });
});
