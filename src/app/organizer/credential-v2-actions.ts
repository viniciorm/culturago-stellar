'use server';

import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { assertRole } from '@/infrastructure/auth/actorContext';
import { requireActorFromSession } from '@/infrastructure/auth/getActorFromSession';
import { query } from '@/infrastructure/database/pool';
import { domainError } from '@/domain/errors';
import {
  CredentialV2Service,
  type CredentialV2Record,
  type IssueCredentialV2Params,
} from '@/infrastructure/credentials/v2/CredentialV2Service';
import {
  SimulatedCredentialV2Gateway,
  type SimulatedV2GatewayResult,
} from '@/infrastructure/credentials/v2/SimulatedCredentialV2Gateway';

export interface ConfirmedParticipationOption {
  participationId: string;
  issuerEntityId: string;
  issuerDisplayName: string;
  subjectEntityId: string;
  subjectDisplayName: string;
  subjectArtisticName: string | null;
  subjectSlug: string;
  eventEntityId: string;
  eventName: string;
  eventYear: number | null;
  presentationCode: string | null;
  existingV2PublicId: string | null;
}

export interface IssueParticipantV2OrganizerInput {
  participationId: string;
  issuerEntityId: string;
  subjectEntityId: string;
  eventEntityId: string;
  participationMode?: 'solo' | 'group';
}

export interface IssueParticipantV2OrganizerResult {
  credential: CredentialV2Record;
  gateway: SimulatedV2GatewayResult;
  passportHref: string;
  credentialHref: string;
  publicStatusLabel: 'Registro local — sin confirmación Stellar';
  simulationNotice: string;
}

/** Off-chain V2 entry with session-derived operator context. */
export async function issueCredentialV2(input: Omit<IssueCredentialV2Params, 'actor'>) {
  const actor = await requireActorFromSession();
  return new CredentialV2Service().issueCredential({ ...input, actor });
}

/**
 * D1 vertical checkpoint entry: derives the operator actor from the validated
 * server session, persists the V2 credential after verifying operator scope and
 * participation evidence, and runs the explicitly labeled simulated V2 gateway
 * (`simulated: true`, `onChainConfirmed: false`). Real Testnet anchoring is D2.
 */
export async function issueCredentialV2WithSimulatedGateway(
  input: Omit<IssueCredentialV2Params, 'actor'>
): Promise<{
  credential: CredentialV2Record;
  gateway: SimulatedV2GatewayResult;
}> {
  const actor = await requireActorFromSession();
  const credential = await new CredentialV2Service().issueCredential({
    ...input,
    actor,
  });
  const gateway = new SimulatedCredentialV2Gateway().simulateIssue(credential, {
    operatorAddress: actor.walletAddress ?? `simulated-operator:${actor.accountId}`,
  });
  return { credential, gateway };
}

/**
 * Lists confirmed participations scoped strictly to the session operator's linked
 * issuer(s) for the `/organizer` panel.
 */
export async function listConfirmedParticipationsForOperator(): Promise<
  ConfirmedParticipationOption[]
> {
  const actor = await requireActorFromSession();
  assertRole(actor, 'admin', 'organizer', 'operator');

  if (!isPersistenceConfigured() || actor.issuerEntityIds.length === 0) {
    return [];
  }

  const res = await query<{
    participation_id: string;
    issuer_entity_id: string;
    issuer_display_name: string;
    subject_entity_id: string;
    subject_display_name: string;
    subject_artistic_name: string | null;
    subject_slug: string;
    event_entity_id: string;
    event_name: string;
    event_year: number | null;
    presentation_code: string | null;
    existing_v2_public_id: string | null;
  }>(
    `SELECT
       p.id AS participation_id,
       iss.id AS issuer_entity_id,
       iss.display_name AS issuer_display_name,
       se.id AS subject_entity_id,
       se.display_name AS subject_display_name,
       pe.artistic_name AS subject_artistic_name,
       se.slug AS subject_slug,
       ev.entity_id AS event_entity_id,
       ev.name AS event_name,
       ev.year AS event_year,
       p.presentation_code,
       existing_cred.public_id AS existing_v2_public_id
     FROM participations p
     JOIN entities se ON se.id = p.subject_entity_id
     LEFT JOIN people pe ON pe.entity_id = se.id
     JOIN events ev ON ev.entity_id = p.event_id
     JOIN entities iss ON iss.id = ev.organizer_entity_id
     LEFT JOIN LATERAL (
       SELECT c.public_id
       FROM credentials c
       WHERE c.participation_id = p.id
         AND c.schema_version = 'culturago.credential.v2'
         AND c.status != 'revoked'
       ORDER BY c.issued_at DESC NULLS LAST
       LIMIT 1
     ) existing_cred ON true
     WHERE p.state = 'participation_confirmed'
       AND ev.organizer_entity_id IS NOT NULL
       AND ev.organizer_entity_id = ANY($1::uuid[])
       AND se.active = true
     ORDER BY COALESCE(p.presentation_code, se.display_name) ASC, p.created_at DESC`,
    [actor.issuerEntityIds]
  );

  return res.rows.map((r) => ({
    participationId: r.participation_id,
    issuerEntityId: r.issuer_entity_id,
    issuerDisplayName: r.issuer_display_name,
    subjectEntityId: r.subject_entity_id,
    subjectDisplayName: r.subject_display_name,
    subjectArtisticName: r.subject_artistic_name,
    subjectSlug: r.subject_slug,
    eventEntityId: r.event_entity_id,
    eventName: r.event_name,
    eventYear: r.event_year,
    presentationCode: r.presentation_code,
    existingV2PublicId: r.existing_v2_public_id,
  }));
}

/**
 * Organizer UI action for D1 (`participant` family): resolves actor from the
 * server session, re-validates issuer scope, subject, event and confirmed
 * participation evidence (browser selection never grants authorization),
 * issues the V2 credential, and runs the explicitly labeled simulated gateway.
 */
export async function issueParticipantCredentialV2FromOrganizer(
  input: IssueParticipantV2OrganizerInput
): Promise<IssueParticipantV2OrganizerResult> {
  const actor = await requireActorFromSession();
  assertRole(actor, 'admin', 'organizer', 'operator');

  if (!actor.issuerEntityIds.includes(input.issuerEntityId)) {
    throw domainError('UNAUTHORIZED', 'Operator is not linked to the credential issuer');
  }

  const partRes = await query<{
    id: string;
    subject_entity_id: string;
    event_id: string;
    state: string;
    presentation_code: string | null;
    subject_slug: string;
    organizer_entity_id: string | null;
    issuer_display_name: string;
  }>(
    `SELECT
       p.id,
       p.subject_entity_id,
       p.event_id,
       p.state::text AS state,
       p.presentation_code,
       se.slug AS subject_slug,
       ev.organizer_entity_id,
       iss.display_name AS issuer_display_name
     FROM participations p
     JOIN entities se ON se.id = p.subject_entity_id
     JOIN events ev ON ev.entity_id = p.event_id
     JOIN entities iss ON iss.id = $2
     WHERE p.id = $1`,
    [input.participationId, input.issuerEntityId]
  );

  if (partRes.rows.length === 0) {
    throw domainError(
      'INVALID_EVIDENCE',
      `Participation '${input.participationId}' must belong to this subject/event and be confirmed`
    );
  }

  const part = partRes.rows[0];
  if (
    part.subject_entity_id !== input.subjectEntityId ||
    part.event_id !== input.eventEntityId ||
    part.state !== 'participation_confirmed'
  ) {
    throw domainError(
      'INVALID_EVIDENCE',
      `Participation '${input.participationId}' must belong to this subject/event and be confirmed`
    );
  }

  if (!part.organizer_entity_id || part.organizer_entity_id !== input.issuerEntityId) {
    throw domainError(
      'INVALID_EVIDENCE',
      `Event '${input.eventEntityId}' is not linked to issuer '${input.issuerEntityId}'`
    );
  }

  const mode = input.participationMode === 'group' ? 'group' : 'solo';
  const displaySubtitle = mode === 'group' ? 'Participación Grupal' : 'Solista';
  const evidenceRole =
    mode === 'group' ? 'confirmed_group_performance' : 'confirmed_solo_performance';

  const { credential, gateway } = await issueCredentialV2WithSimulatedGateway({
    issuerEntityId: input.issuerEntityId,
    subjectEntityId: input.subjectEntityId,
    eventEntityId: input.eventEntityId,
    credentialFamily: 'participant',
    participationMode: mode,
    participationId: input.participationId,
    displayLabel: 'Participante',
    displaySubtitle,
    presentationCode: part.presentation_code ?? undefined,
    organizationName: part.issuer_display_name,
    roles: ['dancer'],
    evidences: [
      {
        sourceType: 'participation',
        sourceId: input.participationId,
        evidenceRole,
      },
    ],
  });

  return {
    credential,
    gateway,
    passportHref: `/p/${encodeURIComponent(part.subject_slug)}`,
    credentialHref: `/credentials/${encodeURIComponent(credential.publicId)}`,
    publicStatusLabel: 'Registro local — sin confirmación Stellar',
    simulationNotice:
      'Simulación D1 en memoria (gatewayMode: simulated_d1, onChainConfirmed: false) — este resultado es una simulación y no constituye confirmación en Stellar.',
  };
}

export async function revokeCredentialV2(publicId: string) {
  const actor = await requireActorFromSession();
  return new CredentialV2Service().revokeCredential(publicId, actor);
}
