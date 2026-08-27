import { describe, expect, it } from 'vitest';
import { groupByEvent, projectPassport } from '@/domain/passport/passport';
import { CredentialRecord } from '@/domain/credentials/credential';

const cred = (overrides: Partial<CredentialRecord>): CredentialRecord => ({
  credentialId: 'cred-a',
  credentialCode: 'CRED-A',
  issuerId: 'org-fdvc',
  issuedBy: 'operator-1',
  subjectId: 'dancer-1',
  eventId: 'fdvc-2026',
  credentialType: 1,
  title: 'Bailarina Participante FDVC 2026',
  description: 'Acreditación oficial de bailarina solista.',
  metadataHash: 'a'.repeat(64),
  hashSchema: 2,
  status: 'issued',
  issuedIntentAt: '2026-03-01T12:00:00Z',
  issuedLedger: 100,
  revokedLedger: null,
  revokedReasonHash: null,
  revokedAt: null,
  revokedBy: null,
  ...overrides,
});

describe('passport projection', () => {
  it('shows a stable multi-event trajectory with independent credentials', () => {
    const a = cred({});
    const b = cred({
      credentialId: 'cred-b',
      credentialCode: 'CRED-B',
      eventId: 'fdvc-2027',
      issuedIntentAt: '2027-03-01T12:00:00Z',
      issuedLedger: 200,
    });

    const passport = projectPassport('dancer-1', [b, a]);
    expect(passport.subjectId).toBe('dancer-1');
    expect(passport.entries.map((e) => e.eventId)).toEqual(['fdvc-2026', 'fdvc-2027']);

    const groups = groupByEvent(passport);
    expect(groups.get('fdvc-2026')![0].credentialCode).toBe('CRED-A');
    expect(groups.get('fdvc-2027')![0].credentialCode).toBe('CRED-B');
  });

  it('keeps revoked credentials visible without affecting valid ones', () => {
    const a = cred({ status: 'revoked', revokedAt: '2026-04-01T00:00:00Z', revokedLedger: 300 });
    const b = cred({ credentialId: 'cred-b', eventId: 'fdvc-2027' });

    const passport = projectPassport('dancer-1', [a, b]);
    const [entryA, entryB] = passport.entries;
    expect(entryA.status).toBe('revoked');
    expect(entryA.revokedAt).toBe('2026-04-01T00:00:00Z');
    expect(entryB.status).toBe('issued');
  });

  it('marks credentials without confirmed ledger as pending_confirmation', () => {
    const pending = cred({ issuedLedger: null });
    const passport = projectPassport('dancer-1', [pending]);
    expect(passport.entries[0].status).toBe('pending_confirmation');
  });

  it('ignores credentials of other subjects', () => {
    const other = cred({ subjectId: 'someone-else' });
    const passport = projectPassport('dancer-1', [other]);
    expect(passport.entries).toHaveLength(0);
  });
});
