import { DatabaseGateway } from '../../ports/DatabaseGateway';
import { domainError } from '../../domain/errors';
import {
  canIssueCredentialFor,
  createParticipation,
  ParticipationRecord,
  ParticipationState,
  transitionParticipation,
} from '../../domain/participation/participation';

export interface ParticipationDeps {
  db: DatabaseGateway;
  newId: () => string;
  now: () => string;
}

export async function registerParticipation(
  deps: ParticipationDeps,
  input: { subjectId: string; eventId: string; actorId: string }
): Promise<ParticipationRecord> {
  const existing = await deps.db.getParticipation(input.subjectId, input.eventId);
  if (existing) return existing;
  const record = createParticipation({
    participationId: deps.newId(),
    subjectId: input.subjectId,
    eventId: input.eventId,
  });
  await deps.db.saveParticipation(record);
  return record;
}

export async function advanceParticipation(
  deps: ParticipationDeps,
  input: { subjectId: string; eventId: string; to: ParticipationState; actorId: string }
): Promise<ParticipationRecord> {
  const record = await deps.db.getParticipation(input.subjectId, input.eventId);
  if (!record) {
    throw domainError('NOT_FOUND', 'Participation not found for subject and event');
  }
  const next = transitionParticipation(record, input.to, input.actorId, deps.now());
  await deps.db.saveParticipation(next);
  return next;
}

export const checkInParticipation = (
  deps: ParticipationDeps,
  input: { subjectId: string; eventId: string; actorId: string }
) => advanceParticipation(deps, { ...input, to: 'checked_in' });

export const confirmParticipation = (
  deps: ParticipationDeps,
  input: { subjectId: string; eventId: string; actorId: string }
) => advanceParticipation(deps, { ...input, to: 'participation_confirmed' });

export async function assertParticipationConfirmed(
  deps: ParticipationDeps,
  subjectId: string,
  eventId: string
): Promise<ParticipationRecord> {
  const record = await deps.db.getParticipation(subjectId, eventId);
  if (!canIssueCredentialFor(record)) {
    throw domainError(
      'PARTICIPATION_NOT_CONFIRMED',
      'Issuance requires an audited participation_confirmed state; participant_of alone is not enough'
    );
  }
  return record!;
}
