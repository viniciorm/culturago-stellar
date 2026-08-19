import { describe, expect, it } from 'vitest';
import {
  canIssueCredentialFor,
  createParticipation,
  transitionParticipation,
} from '@/domain/participation/participation';
import { isDomainError } from '@/domain/errors';

const record = () =>
  createParticipation({ participationId: 'p1', subjectId: 'dancer-1', eventId: 'fdvc-2026' });

describe('participation lifecycle', () => {
  it('follows registered -> checked_in -> participation_confirmed -> credential_issued', () => {
    let r = record();
    expect(r.state).toBe('registered');

    r = transitionParticipation(r, 'checked_in', 'staff-1', '2026-03-01T10:00:00Z');
    expect(r.state).toBe('checked_in');

    r = transitionParticipation(r, 'participation_confirmed', 'organizer-1', '2026-03-01T18:00:00Z');
    expect(r.state).toBe('participation_confirmed');

    r = transitionParticipation(r, 'credential_issued', 'organizer-1', '2026-03-02T09:00:00Z');
    expect(r.state).toBe('credential_issued');
    expect(r.history).toHaveLength(3);
    expect(r.history[0]).toMatchObject({ from: 'registered', to: 'checked_in', actorId: 'staff-1' });
  });

  it('rejects skipping states with a typed error', () => {
    try {
      transitionParticipation(record(), 'participation_confirmed', 'org', '2026-03-01T00:00:00Z');
      expect.unreachable();
    } catch (e) {
      expect(isDomainError(e, 'INVALID_STATE_TRANSITION')).toBe(true);
    }
  });

  it('rejects reverse and terminal transitions', () => {
    let r = transitionParticipation(record(), 'checked_in', 'staff', '2026-03-01T00:00:00Z');
    expect(() =>
      transitionParticipation(r, 'registered', 'staff', '2026-03-01T01:00:00Z')
    ).toThrowError(expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }));

    r = transitionParticipation(r, 'participation_confirmed', 'org', '2026-03-01T02:00:00Z');
    r = transitionParticipation(r, 'credential_issued', 'org', '2026-03-01T03:00:00Z');
    expect(() =>
      transitionParticipation(r, 'checked_in', 'org', '2026-03-01T04:00:00Z')
    ).toThrowError(expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }));
  });

  it('participant_of without audited confirmation never enables issuance', () => {
    expect(canIssueCredentialFor(null)).toBe(false);
    expect(canIssueCredentialFor(record())).toBe(false);
    const checkedIn = transitionParticipation(record(), 'checked_in', 's', '2026-03-01T00:00:00Z');
    expect(canIssueCredentialFor(checkedIn)).toBe(false);
    const confirmed = transitionParticipation(checkedIn, 'participation_confirmed', 'o', '2026-03-01T01:00:00Z');
    expect(canIssueCredentialFor(confirmed)).toBe(true);
  });

  it('requires subject and event', () => {
    expect(() =>
      createParticipation({ participationId: 'p', subjectId: '', eventId: 'e' })
    ).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });
});
