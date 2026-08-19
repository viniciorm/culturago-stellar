import { domainError } from '../errors';

export type ParticipationState =
  | 'registered'
  | 'checked_in'
  | 'participation_confirmed'
  | 'credential_issued';

export interface ParticipationTransition {
  from: ParticipationState;
  to: ParticipationState;
  actorId: string;
  at: string;
}

export interface ParticipationRecord {
  participationId: string;
  subjectId: string;
  eventId: string;
  state: ParticipationState;
  history: ParticipationTransition[];
}

const ALLOWED_TRANSITIONS: Readonly<Record<ParticipationState, readonly ParticipationState[]>> = {
  registered: ['checked_in'],
  checked_in: ['participation_confirmed'],
  participation_confirmed: ['credential_issued'],
  credential_issued: [],
};

export function createParticipation(input: {
  participationId: string;
  subjectId: string;
  eventId: string;
}): ParticipationRecord {
  if (!input.subjectId || !input.eventId) {
    throw domainError('INVALID_INPUT', 'Participation requires subjectId and eventId');
  }
  return {
    participationId: input.participationId,
    subjectId: input.subjectId,
    eventId: input.eventId,
    state: 'registered',
    history: [],
  };
}

export function transitionParticipation(
  record: ParticipationRecord,
  to: ParticipationState,
  actorId: string,
  at: string
): ParticipationRecord {
  const allowed = ALLOWED_TRANSITIONS[record.state];
  if (!allowed.includes(to)) {
    throw domainError(
      'INVALID_STATE_TRANSITION',
      `Cannot transition participation from ${record.state} to ${to}`
    );
  }
  return {
    ...record,
    state: to,
    history: [...record.history, { from: record.state, to, actorId, at }],
  };
}

/**
 * A `participant_of` relationship alone never authorizes issuance: only an
 * audited `participation_confirmed` state does.
 */
export function canIssueCredentialFor(record: ParticipationRecord | null): boolean {
  return record?.state === 'participation_confirmed';
}
