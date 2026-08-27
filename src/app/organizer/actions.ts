'use server';

import { randomUUID } from 'crypto';
import { redirect } from 'next/navigation';
import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { requireActorFromSession } from '@/infrastructure/auth/getActorFromSession';
import { assertIssuerScope } from '@/infrastructure/auth/actorContext';
import { createStellarGateway } from '@/infrastructure/stellar/createStellarGateway';
import { domainError } from '@/domain/errors';
import { PostgreSQLDatabaseGateway } from '@/infrastructure/database/PostgreSQLDatabaseGateway';
import {
  checkInParticipation,
  confirmParticipation,
  registerParticipation,
  advanceParticipation,
} from '@/application/use-cases/manage-participation';
import { issueCredential as issueCredentialUseCase } from '@/application/use-cases/issue-credential';
import { revokeCredential as revokeCredentialUseCase } from '@/application/use-cases/revoke-credential';
import { computeMetadataHash } from '@/lib/credentialMetadata';

const db = new PostgreSQLDatabaseGateway();

const newId = () => randomUUID();
const now = () => new Date().toISOString();

function ensurePersistence(): void {
  if (!isPersistenceConfigured()) {
    throw domainError('INTERNAL', 'El panel de organizador requiere DATABASE_URL configurada');
  }
}

async function parseReasonHash(raw: string | null): Promise<string | null> {
  if (!raw || raw.trim().length === 0) return null;
  return computeMetadataHash({ reason: raw.trim() });
}

/**
 * Confirma la participación de un sujeto en un evento.
 * Si aún no existe, la crea y avanza por el flujo completo
 * registered -> checked_in -> participation_confirmed.
 */
export async function checkIn(formData: FormData): Promise<void> {
  const actor = await requireActorFromSession();
  ensurePersistence();

  const subjectId = (formData.get('subjectId') as string)?.trim();
  const eventId = (formData.get('eventId') as string)?.trim();

  if (!subjectId || !eventId) {
    throw domainError('INVALID_INPUT', 'Se requiere subjectId y eventId');
  }

  const existing = await db.getParticipation(subjectId, eventId);

  if (!existing) {
    await registerParticipation(
      { db, newId, now },
      { subjectId, eventId, actorId: actor.accountId }
    );
    await checkInParticipation(
      { db, newId, now },
      { subjectId, eventId, actorId: actor.accountId }
    );
    await confirmParticipation(
      { db, newId, now },
      { subjectId, eventId, actorId: actor.accountId }
    );
  } else if (existing.state === 'registered') {
    await checkInParticipation(
      { db, newId, now },
      { subjectId, eventId, actorId: actor.accountId }
    );
    await confirmParticipation(
      { db, newId, now },
      { subjectId, eventId, actorId: actor.accountId }
    );
  } else if (existing.state === 'checked_in') {
    await confirmParticipation(
      { db, newId, now },
      { subjectId, eventId, actorId: actor.accountId }
    );
  } else if (existing.state !== 'participation_confirmed') {
    throw domainError('INVALID_STATE_TRANSITION', `Participación en estado ${existing.state}`);
  }

  redirect('/organizer?ok=checkin');
}

/**
 * Emite una credencial una vez confirmada la participación, guarda el registro
 * local y prepara la operación on-chain. El cliente firma el payload y lo
 * reenvía a /api/sign/submit.
 */
export async function issueCredential(formData: FormData) {
  const actor = await requireActorFromSession();
  ensurePersistence();

  const issuerId = (formData.get('issuerId') as string)?.trim();
  const subjectId = (formData.get('subjectId') as string)?.trim();
  const eventId = (formData.get('eventId') as string)?.trim();
  const credentialType = (formData.get('credentialType') as string)?.trim();
  const title = (formData.get('title') as string)?.trim();
  const description = (formData.get('description') as string | null)?.trim() ?? null;
  let credentialCode = (formData.get('credentialCode') as string)?.trim() || null;

  if (!issuerId || !subjectId || !eventId || !credentialType || !title) {
    throw domainError('INVALID_INPUT', 'Faltan campos obligatorios');
  }

  assertIssuerScope(actor, issuerId);

  if (!actor.walletAddress) {
    throw domainError('UNAUTHORIZED', 'El operador no tiene una wallet on-chain configurada');
  }

  const participation = await db.getParticipation(subjectId, eventId);
  if (!participation || participation.state !== 'participation_confirmed') {
    throw domainError(
      'PARTICIPATION_NOT_CONFIRMED',
      'Se requiere confirmar la participación antes de emitir la credencial'
    );
  }

  if (!credentialCode) {
    const short = credentialType.replace(/_/g, '-').toUpperCase().slice(0, 20);
    const suffix = randomUUID().split('-')[0];
    credentialCode = `CRED-${short}-${suffix}`;
  }

  const metadataPayload = {
    credential_code: credentialCode,
    issuer_entity_id: issuerId,
    subject_entity_id: subjectId,
    event_id: eventId,
    credential_type: credentialType,
    title,
    description: description ?? null,
    issued_at: now(),
  };

  const metadataHash = await computeMetadataHash(metadataPayload);
  const hashSchema = 1;

  const record = await issueCredentialUseCase(
    { db, newId, now },
    {
      issuerId,
      operatorId: actor.accountId,
      subjectId,
      eventId,
      credentialType,
      credentialCode,
      title,
      description,
      metadataHash,
      hashSchema,
    }
  );

  const bundle = createStellarGateway();
  const state = await bundle.gateway.prepareIssueCredential({
    idempotencyKey: `issue:${record.credentialId}`,
    actorAddress: actor.walletAddress,
    credentialId: record.credentialId,
    issuerId,
    subjectId,
    eventId,
    credentialType: record.credentialType,
    metadataHash,
    hashSchema,
  });

  const prepared = await bundle.gateway.getPreparedPayload(state.operationId);

  await advanceParticipation(
    { db, newId, now },
    { subjectId, eventId, to: 'credential_issued', actorId: actor.accountId }
  );

  return { success: true as const, operation: state, prepared };
}

/**
 * Revoca una credencial previamente emitida y prepara la operación on-chain.
 * El cliente firma el payload y lo reenvía a /api/sign/submit.
 */
export async function revokeCredential(formData: FormData) {
  const actor = await requireActorFromSession();
  ensurePersistence();

  const credentialId = (formData.get('credentialId') as string)?.trim();
  const reason = formData.get('reason') as string | null;

  if (!credentialId) {
    throw domainError('INVALID_INPUT', 'Se requiere credentialId');
  }

  if (!actor.walletAddress) {
    throw domainError('UNAUTHORIZED', 'El operador no tiene una wallet on-chain configurada');
  }

  const reasonHash = await parseReasonHash(reason);

  const record = await revokeCredentialUseCase(
    { db, now },
    { credentialId, operatorId: actor.accountId, reasonHash }
  );

  assertIssuerScope(actor, record.issuerId);

  const bundle = createStellarGateway();
  const state = await bundle.gateway.prepareRevokeCredential({
    idempotencyKey: `revoke:${record.credentialId}:${record.revokedReasonHash ?? ''}`,
    actorAddress: actor.walletAddress,
    credentialId: record.credentialId,
    reasonHash: record.revokedReasonHash,
  });

  const prepared = await bundle.gateway.getPreparedPayload(state.operationId);

  return { success: true as const, operation: state, prepared };
}
