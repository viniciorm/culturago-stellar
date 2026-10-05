import 'server-only';
import { PoolClient } from 'pg';
import { query, translatePgError, withTransaction } from '../../database/pool';
import { domainError } from '../../../domain/errors';
import {
  CanonicalPayloadV2,
  CredentialFamily,
  EvidenceSourceType,
  ParticipationMode,
  buildCanonicalPayloadV2,
  computePayloadDigestV2,
  generatePublicIdV2,
  validateCredentialV2Input,
} from '../../../domain/credentials/v2';

export interface EvidenceInputParam {
  sourceType: EvidenceSourceType;
  sourceId: string;
  evidenceRole: string;
  notes?: string | null;
}

export interface IssueCredentialV2Params {
  issuerEntityId: string;
  subjectEntityId: string;
  eventEntityId: string;
  credentialFamily: CredentialFamily;
  participationMode: ParticipationMode;
  participationId?: string | null;
  displayLabel: string;
  displaySubtitle: string;
  presentationCode?: string | null;
  organizationName?: string | null;
  roles: string[];
  evidences: EvidenceInputParam[];
  issuedAt?: string;
  publicId?: string;
}

export interface CredentialEvidenceRecord {
  id: string;
  credentialId: string;
  sourceType: EvidenceSourceType;
  sourceId: string;
  evidenceRole: string;
  notes: string | null;
  createdAt: string;
}

export interface CredentialV2Record {
  id: string;
  publicId: string;
  issuerEntityId: string;
  subjectEntityId: string;
  eventEntityId: string;
  credentialFamily: CredentialFamily;
  participationMode: ParticipationMode;
  participationId: string | null;
  schemaVersion: 'culturago.credential.v2';
  displayLabel: string;
  displaySubtitle: string;
  canonicalPayload: CanonicalPayloadV2;
  payloadDigest: string;
  status: 'draft' | 'issued' | 'revoked';
  issuedAt: string;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  evidences: CredentialEvidenceRecord[];
}

export interface PublicCredentialView {
  id: string;
  publicId: string;
  status: 'draft' | 'issued' | 'revoked';
  schemaVersion: 'culturago.credential.v2';
  credentialFamily: CredentialFamily;
  participationMode: ParticipationMode;
  displayLabel: string;
  displaySubtitle: string;
  presentationCode?: string | null;
  organizationName?: string | null;
  roles: string[];
  issuedAt: string;
  revokedAt?: string | null;
  payloadDigest: string;
  canonicalPayload: CanonicalPayloadV2;
  issuer: {
    id: string;
    displayName: string;
    kind: string;
    slug?: string;
  };
  subject: {
    id: string;
    displayName: string;
    kind: string;
    artisticName?: string | null;
    slug?: string;
  };
  event: {
    id: string;
    name: string;
    year?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    location?: string | null;
  };
  evidences: {
    id: string;
    sourceType: EvidenceSourceType;
    sourceId: string;
    evidenceRole: string;
    notes?: string | null;
  }[];
}

export class CredentialV2Service {
  /**
   * Issues a new Credential V2 transactionally.
   * Ensures deterministic canonical payload generation, SHA-256 payload_digest calculation,
   * database constraints, and polymorphic evidence persistence.
   */
  async issueCredential(
    params: IssueCredentialV2Params,
    existingClient?: PoolClient
  ): Promise<CredentialV2Record> {
    const execute = async (client: PoolClient): Promise<CredentialV2Record> => {
      // 1. Fetch and validate Issuer
      const issuerRes = await client.query<{
        id: string;
        display_name: string;
        kind: string;
        slug: string | null;
      }>(
        `SELECT id, display_name, kind, slug FROM entities WHERE id = $1`,
        [params.issuerEntityId]
      );
      if (issuerRes.rows.length === 0) {
        throw domainError('INVALID_CREDENTIAL', `Issuer entity '${params.issuerEntityId}' not found`);
      }
      const issuer = issuerRes.rows[0];

      // 2. Fetch and validate Subject
      const subjectRes = await client.query<{
        id: string;
        display_name: string;
        kind: string;
        slug: string | null;
        artistic_name: string | null;
      }>(
        `SELECT e.id, e.display_name, e.kind, e.slug, p.artistic_name
         FROM entities e
         LEFT JOIN people p ON p.entity_id = e.id
         WHERE e.id = $1`,
        [params.subjectEntityId]
      );
      if (subjectRes.rows.length === 0) {
        throw domainError('INVALID_CREDENTIAL', `Subject entity '${params.subjectEntityId}' not found`);
      }
      const subject = subjectRes.rows[0];

      // 3. Fetch and validate Event
      const eventRes = await client.query<{
        id: string;
        name: string;
        year: number;
        start_date: string;
        end_date: string | null;
        location: string | null;
      }>(
        `SELECT e.id, ev.name, ev.year, ev.start_date, ev.end_date, ev.location
         FROM entities e
         JOIN events ev ON ev.entity_id = e.id
         WHERE e.id = $1`,
        [params.eventEntityId]
      );
      if (eventRes.rows.length === 0) {
        throw domainError('INVALID_CREDENTIAL', `Event entity '${params.eventEntityId}' not found`);
      }
      const event = eventRes.rows[0];

      // 4. Validate Evidences polymorphic existence
      if (!params.evidences || params.evidences.length === 0) {
        throw domainError('INVALID_EVIDENCE', 'Credential V2 requires at least one evidence item');
      }

      for (const ev of params.evidences) {
        if (ev.sourceType === 'participation') {
          const partRes = await client.query(
            `SELECT id FROM participations WHERE id = $1`,
            [ev.sourceId]
          );
          if (partRes.rows.length === 0) {
            throw domainError('INVALID_EVIDENCE', `Participation '${ev.sourceId}' does not exist in database`);
          }
        } else if (ev.sourceType === 'relationship') {
          const relRes = await client.query(
            `SELECT id FROM relationships WHERE id = $1`,
            [ev.sourceId]
          );
          if (relRes.rows.length === 0) {
            throw domainError('INVALID_EVIDENCE', `Relationship '${ev.sourceId}' does not exist in database`);
          }
        } else {
          throw domainError('INVALID_EVIDENCE', `Invalid evidence source_type '${ev.sourceType}'`);
        }
      }

      // 5. Check family & mode coherence
      if (params.credentialFamily === 'participant' || params.credentialFamily === 'guest') {
        if (!params.participationId) {
          throw domainError(
            'INVALID_CREDENTIAL',
            `Family '${params.credentialFamily}' requires a valid participationId`
          );
        }
        if (params.participationMode !== 'solo' && params.participationMode !== 'group') {
          throw domainError(
            'INVALID_CREDENTIAL',
            `Family '${params.credentialFamily}' requires mode 'solo' or 'group'`
          );
        }
        const hasParticipationEvidence = params.evidences.some(
          (e) => e.sourceType === 'participation' && e.sourceId === params.participationId
        );
        if (!hasParticipationEvidence) {
          throw domainError(
            'INVALID_EVIDENCE',
            `Evidence list must include the main participation '${params.participationId}'`
          );
        }
      } else if (params.credentialFamily === 'staff') {
        if (params.participationMode !== 'not_applicable') {
          throw domainError(
            'INVALID_CREDENTIAL',
            `Family 'staff' requires mode 'not_applicable'`
          );
        }
        if (params.participationId != null) {
          throw domainError(
            'INVALID_CREDENTIAL',
            `Family 'staff' must have participationId as null`
          );
        }
        const hasRelationshipEvidence = params.evidences.some(
          (e) => e.sourceType === 'relationship'
        );
        if (!hasRelationshipEvidence) {
          throw domainError(
            'INVALID_EVIDENCE',
            `Staff credential requires at least one relationship evidence`
          );
        }
      }

      // 6. Generate public_id and timestamps
      const publicId = params.publicId || generatePublicIdV2();
      const issuedAt = params.issuedAt || new Date().toISOString();

      // Normalize dates for canonical payload
      const formatDate = (val: string | null | undefined): string | null => {
        if (!val) return null;
        if (typeof val === 'string' && val.length >= 10) return val.slice(0, 10);
        return String(val);
      };

      // 7. Build Canonical Payload V2
      const canonicalPayload = buildCanonicalPayloadV2({
        publicId,
        credentialFamily: params.credentialFamily,
        participationMode: params.participationMode,
        issuer: {
          id: issuer.id,
          display_name: issuer.display_name,
          kind: issuer.kind,
          ...(issuer.slug ? { slug: issuer.slug } : {}),
        },
        subject: {
          id: subject.id,
          display_name: subject.display_name,
          kind: subject.kind,
          ...(subject.artistic_name ? { artistic_name: subject.artistic_name } : {}),
          ...(subject.slug ? { slug: subject.slug } : {}),
        },
        event: {
          id: event.id,
          name: event.name,
          ...(event.year != null ? { year: event.year } : {}),
          ...(event.start_date ? { start_date: formatDate(event.start_date) } : {}),
          ...(event.end_date ? { end_date: formatDate(event.end_date) } : {}),
          ...(event.location ? { location: event.location } : {}),
        },
        displayLabel: params.displayLabel,
        displaySubtitle: params.displaySubtitle,
        presentationCode: params.presentationCode,
        organizationName: params.organizationName,
        roles: params.roles,
        evidences: params.evidences.map((e) => ({
          source_type: e.sourceType,
          source_id: e.sourceId,
          evidence_role: e.evidenceRole,
        })),
        issuedAt,
      });

      // 8. Compute payload digest
      const payloadDigest = computePayloadDigestV2(canonicalPayload);

      // 9. Domain validation
      validateCredentialV2Input({
        publicId,
        issuerEntityId: params.issuerEntityId,
        subjectEntityId: params.subjectEntityId,
        eventEntityId: params.eventEntityId,
        credentialFamily: params.credentialFamily,
        participationMode: params.participationMode,
        participationId: params.participationId,
        schemaVersion: 'culturago.credential.v2',
        displayLabel: params.displayLabel,
        displaySubtitle: params.displaySubtitle,
        canonicalPayload,
        payloadDigest,
        issuedAt,
      });

      // 10. Persist credential into database
      try {
        const credRes = await client.query<{
          id: string;
          public_id: string;
          issuer_entity_id: string;
          subject_entity_id: string;
          event_id: string;
          credential_family: CredentialFamily;
          participation_mode: ParticipationMode;
          participation_id: string | null;
          schema_version: 'culturago.credential.v2';
          display_label: string;
          display_subtitle: string;
          canonical_payload: CanonicalPayloadV2;
          payload_digest: string;
          status: 'draft' | 'issued' | 'revoked';
          issued_at: string;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        }>(
          `INSERT INTO credentials (
            public_id,
            issuer_entity_id,
            subject_entity_id,
            event_id,
            credential_family,
            participation_mode,
            participation_id,
            schema_version,
            display_label,
            display_subtitle,
            canonical_payload,
            payload_digest,
            status,
            issued_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'issued', $13
          ) RETURNING *`,
          [
            publicId,
            params.issuerEntityId,
            params.subjectEntityId,
            params.eventEntityId,
            params.credentialFamily,
            params.participationMode,
            params.participationId || null,
            'culturago.credential.v2',
            params.displayLabel,
            params.displaySubtitle,
            JSON.stringify(canonicalPayload),
            payloadDigest,
            issuedAt,
          ]
        );

        const createdCred = credRes.rows[0];

        // 11. Persist credential_evidence
        const insertedEvidences: CredentialEvidenceRecord[] = [];
        for (const ev of params.evidences) {
          const evRes = await client.query<{
            id: string;
            credential_id: string;
            source_type: EvidenceSourceType;
            source_id: string;
            evidence_role: string;
            notes: string | null;
            created_at: string;
          }>(
            `INSERT INTO credential_evidence (
              credential_id,
              source_type,
              source_id,
              evidence_role,
              notes
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [createdCred.id, ev.sourceType, ev.sourceId, ev.evidenceRole, ev.notes || null]
          );
          insertedEvidences.push({
            id: evRes.rows[0].id,
            credentialId: evRes.rows[0].credential_id,
            sourceType: evRes.rows[0].source_type,
            sourceId: evRes.rows[0].source_id,
            evidenceRole: evRes.rows[0].evidence_role,
            notes: evRes.rows[0].notes,
            createdAt: evRes.rows[0].created_at,
          });
        }

        return {
          id: createdCred.id,
          publicId: createdCred.public_id,
          issuerEntityId: createdCred.issuer_entity_id,
          subjectEntityId: createdCred.subject_entity_id,
          eventEntityId: createdCred.event_id,
          credentialFamily: createdCred.credential_family,
          participationMode: createdCred.participation_mode,
          participationId: createdCred.participation_id,
          schemaVersion: createdCred.schema_version,
          displayLabel: createdCred.display_label,
          displaySubtitle: createdCred.display_subtitle,
          canonicalPayload: createdCred.canonical_payload,
          payloadDigest: createdCred.payload_digest,
          status: createdCred.status,
          issuedAt: createdCred.issued_at,
          revokedAt: createdCred.revoked_at,
          createdAt: createdCred.created_at,
          updatedAt: createdCred.updated_at,
          evidences: insertedEvidences,
        };
      } catch (err: any) {
        if (err.code === '23505') {
          // Unique violation
          if (err.constraint === 'uq_credentials_public_id') {
            throw domainError('ALREADY_EXISTS', `Public ID '${publicId}' already exists`);
          }
          if (err.constraint === 'uq_credentials_participant_guest_non_revoked') {
            throw domainError(
              'ALREADY_EXISTS',
              `An active credential already exists for subject '${params.subjectEntityId}' and participation '${params.participationId}' in this event`
            );
          }
          if (err.constraint === 'uq_credentials_staff_non_revoked') {
            throw domainError(
              'ALREADY_EXISTS',
              `An active staff credential already exists for subject '${params.subjectEntityId}' in this event`
            );
          }
        }
        translatePgError(err);
      }
    };

    if (existingClient) {
      return execute(existingClient);
    }
    return withTransaction(execute);
  }

  /**
   * Retrieves a credential by its public_id for public verification.
   * Returns null if not found.
   */
  async getCredentialByPublicId(publicId: string): Promise<PublicCredentialView | null> {
    const credRes = await query<{
      id: string;
      public_id: string;
      status: 'draft' | 'issued' | 'revoked';
      schema_version: 'culturago.credential.v2';
      credential_family: CredentialFamily;
      participation_mode: ParticipationMode;
      display_label: string;
      display_subtitle: string;
      canonical_payload: CanonicalPayloadV2;
      payload_digest: string;
      issued_at: string;
      revoked_at: string | null;
      issuer_id: string;
      issuer_name: string;
      issuer_kind: string;
      issuer_slug: string | null;
      subject_id: string;
      subject_name: string;
      subject_kind: string;
      subject_slug: string | null;
      subject_artistic_name: string | null;
      event_id: string;
      event_name: string;
      event_year: number | null;
      event_start_date: string | null;
      event_end_date: string | null;
      event_location: string | null;
    }>(
      `SELECT
        c.id,
        c.public_id,
        c.status,
        c.schema_version,
        c.credential_family,
        c.participation_mode,
        c.display_label,
        c.display_subtitle,
        c.canonical_payload,
        c.payload_digest,
        c.issued_at,
        c.revoked_at,
        iss.id AS issuer_id,
        iss.display_name AS issuer_name,
        iss.kind AS issuer_kind,
        iss.slug AS issuer_slug,
        sub.id AS subject_id,
        sub.display_name AS subject_name,
        sub.kind AS subject_kind,
        sub.slug AS subject_slug,
        p.artistic_name AS subject_artistic_name,
        ev.entity_id AS event_id,
        ev.name AS event_name,
        ev.year AS event_year,
        ev.start_date::text AS event_start_date,
        ev.end_date::text AS event_end_date,
        ev.location AS event_location
      FROM credentials c
      JOIN entities iss ON iss.id = c.issuer_entity_id
      JOIN entities sub ON sub.id = c.subject_entity_id
      LEFT JOIN people p ON p.entity_id = sub.id
      JOIN events ev ON ev.entity_id = c.event_id
      WHERE c.public_id = $1`,
      [publicId]
    );

    if (credRes.rows.length === 0) {
      return null;
    }

    const row = credRes.rows[0];

    const evidenceRes = await query<{
      id: string;
      source_type: EvidenceSourceType;
      source_id: string;
      evidence_role: string;
      notes: string | null;
    }>(
      `SELECT id, source_type, source_id, evidence_role, notes
       FROM credential_evidence
       WHERE credential_id = $1
       ORDER BY created_at ASC`,
      [row.id]
    );

    const payload = typeof row.canonical_payload === 'string'
      ? JSON.parse(row.canonical_payload)
      : row.canonical_payload;

    return {
      id: row.id,
      publicId: row.public_id,
      status: row.status,
      schemaVersion: row.schema_version,
      credentialFamily: row.credential_family,
      participationMode: row.participation_mode,
      displayLabel: row.display_label,
      displaySubtitle: row.display_subtitle,
      presentationCode: payload?.claim?.presentation_code ?? null,
      organizationName: payload?.claim?.organization_name ?? null,
      roles: payload?.claim?.roles ?? [],
      issuedAt: row.issued_at,
      revokedAt: row.revoked_at,
      payloadDigest: row.payload_digest,
      canonicalPayload: payload,
      issuer: {
        id: row.issuer_id,
        displayName: row.issuer_name,
        kind: row.issuer_kind,
        ...(row.issuer_slug ? { slug: row.issuer_slug } : {}),
      },
      subject: {
        id: row.subject_id,
        displayName: row.subject_name,
        kind: row.subject_kind,
        artisticName: row.subject_artistic_name,
        ...(row.subject_slug ? { slug: row.subject_slug } : {}),
      },
      event: {
        id: row.event_id,
        name: row.event_name,
        year: row.event_year,
        startDate: row.event_start_date,
        endDate: row.event_end_date,
        location: row.event_location,
      },
      evidences: evidenceRes.rows.map((ev) => ({
        id: ev.id,
        sourceType: ev.source_type,
        sourceId: ev.source_id,
        evidenceRole: ev.evidence_role,
        notes: ev.notes,
      })),
    };
  }

  /**
   * Revokes a credential by its public_id.
   * STRICT IMMUTABILITY: `canonical_payload` and `payload_digest` are NOT modified.
   * Only `status` is transitioned to 'revoked' and `revoked_at` is populated.
   */
  async revokeCredential(publicId: string): Promise<PublicCredentialView> {
    const res = await query<{
      id: string;
      status: 'draft' | 'issued' | 'revoked';
    }>(
      `UPDATE credentials
       SET status = 'revoked',
           revoked_at = NOW(),
           updated_at = NOW()
       WHERE public_id = $1
       RETURNING id, status`,
      [publicId]
    );

    if (res.rows.length === 0) {
      // Check if it exists at all
      const check = await query(`SELECT id FROM credentials WHERE public_id = $1`, [publicId]);
      if (check.rows.length === 0) {
        throw domainError('NOT_FOUND', `Credential '${publicId}' not found`);
      }
    }

    const updated = await this.getCredentialByPublicId(publicId);
    if (!updated) {
      throw domainError('NOT_FOUND', `Credential '${publicId}' not found after update`);
    }
    return updated;
  }
}
