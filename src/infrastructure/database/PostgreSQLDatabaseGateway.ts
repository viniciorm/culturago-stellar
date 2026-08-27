import 'server-only';
import {
  DatabaseGateway,
  IssuerOperatorLink,
  NewEntityDetails,
} from '../../ports/DatabaseGateway';
import { CredentialRecord } from '../../domain/credentials/credential';
import { EntityRecord, EntityVersion } from '../../domain/entities/entity';
import {
  ParticipationRecord,
  ParticipationState,
} from '../../domain/participation/participation';
import {
  DomainEntityKind,
  RelationshipType,
} from '../../domain/participation/relationships';
import { domainError } from '../../domain/errors';
import { query, translatePgError } from './pool';

interface CredentialRow {
  id: string;
  credential_code: string;
  issuer_entity_id: string;
  issued_by: string;
  subject_entity_id: string;
  event_id: string;
  credential_type: number;
  title: string;
  description: string | null;
  metadata_hash: string;
  hash_schema: number;
  status: 'issued' | 'revoked';
  issued_intent_at: string;
  issued_ledger: number | null;
  revoked_ledger: number | null;
  revoked_reason_hash: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
}

function toCredentialRecord(row: CredentialRow): CredentialRecord {
  return {
    credentialId: row.id,
    credentialCode: row.credential_code,
    issuerId: row.issuer_entity_id,
    issuedBy: row.issued_by,
    subjectId: row.subject_entity_id,
    eventId: row.event_id,
    credentialType: row.credential_type as CredentialRecord['credentialType'],
    title: row.title,
    description: row.description,
    metadataHash: row.metadata_hash,
    hashSchema: row.hash_schema,
    status: row.status,
    issuedIntentAt: row.issued_intent_at,
    issuedLedger: row.issued_ledger,
    revokedLedger: row.revoked_ledger,
    revokedReasonHash: row.revoked_reason_hash,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
  };
}

/**
 * PostgreSQL adapter for the persistence port. Server-only, parameterized
 * queries, typed domain errors. Authorization happens in use cases/DAL via
 * ActorContext; this adapter enforces integrity (constraints, transitions).
 */
export class PostgreSQLDatabaseGateway implements DatabaseGateway {
  async getEntityRecord(entityId: string): Promise<EntityRecord | null> {
    const entityResult = await query<{ id: string; active: boolean; latest_version: number }>(
      'SELECT id, active, latest_version FROM entities WHERE id = $1',
      [entityId]
    ).catch(translatePgError);
    const entity = entityResult.rows[0];
    if (!entity) return null;

    const versionsResult = await query<{
      version: number;
      metadata_hash: string;
      hash_schema: number;
      registrar_id: string;
      recorded_at: string;
      recorded_ledger: number | null;
    }>(
      `SELECT version, metadata_hash, hash_schema, registrar_id, recorded_at, recorded_ledger
       FROM entity_versions WHERE entity_id = $1 ORDER BY version ASC`,
      [entityId]
    ).catch(translatePgError);

    const history: EntityVersion[] = versionsResult.rows.map((v) => ({
      version: v.version,
      metadataHash: v.metadata_hash,
      hashSchema: v.hash_schema,
      registrarId: v.registrar_id,
      recordedAt: v.recorded_at,
      recordedLedger: v.recorded_ledger,
    }));

    return {
      entityId: entity.id,
      active: entity.active,
      latestVersion: entity.latest_version,
      versions: history,
    };
  }

  async saveEntityRecord(record: EntityRecord, details?: NewEntityDetails): Promise<void> {
    const existing = await this.getEntityRecord(record.entityId);

    if (existing) {
      // Optimistic control: only advance from the expected latest version.
      const updated = await query(
        `UPDATE entities SET active = $2, latest_version = $3
         WHERE id = $1 AND latest_version <= $3`,
        [record.entityId, record.active, record.latestVersion]
      ).catch(translatePgError);
      if (updated.rowCount === 0) {
        throw domainError('VERSION_CONFLICT', `Entity ${record.entityId} version conflict`);
      }
    } else {
      if (!details) {
        throw domainError(
          'INVALID_INPUT',
          `Entity ${record.entityId} does not exist and no creation details were provided`
        );
      }
      await query(
        `INSERT INTO entities (id, kind, display_name, slug, country, city, active, latest_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          record.entityId,
          details.kind,
          details.displayName,
          details.slug,
          details.country,
          details.city,
          record.active,
          record.latestVersion,
        ]
      ).catch(translatePgError);
    }

    for (const version of record.versions) {
      await query(
        `INSERT INTO entity_versions
           (entity_id, version, metadata_hash, hash_schema, registrar_id, recorded_at, recorded_ledger)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (entity_id, version) DO NOTHING`,
        [
          record.entityId,
          version.version,
          version.metadataHash,
          version.hashSchema,
          version.registrarId,
          version.recordedAt,
          version.recordedLedger,
        ]
      ).catch(translatePgError);
    }
  }

  async getEntityKind(entityId: string): Promise<DomainEntityKind | null> {
    const result = await query<{ kind: DomainEntityKind }>(
      'SELECT kind FROM entities WHERE id = $1',
      [entityId]
    ).catch(translatePgError);
    return result.rows[0]?.kind ?? null;
  }

  async getParticipation(subjectId: string, eventId: string): Promise<ParticipationRecord | null> {
    const result = await query<{ id: string; state: ParticipationState }>(
      'SELECT id, state FROM participations WHERE subject_entity_id = $1 AND event_id = $2',
      [subjectId, eventId]
    ).catch(translatePgError);
    const participation = result.rows[0];
    if (!participation) return null;

    const transitions = await query<{
      from_state: ParticipationState;
      to_state: ParticipationState;
      actor_label: string;
      at: string;
    }>(
      `SELECT from_state, to_state, actor_label, at
       FROM participation_transitions WHERE participation_id = $1 ORDER BY seq ASC`,
      [participation.id]
    ).catch(translatePgError);

    return {
      participationId: participation.id,
      subjectId,
      eventId,
      state: participation.state,
      history: transitions.rows.map((t) => ({
        from: t.from_state,
        to: t.to_state,
        actorId: t.actor_label,
        at: t.at,
      })),
    };
  }

  async saveParticipation(record: ParticipationRecord): Promise<void> {
    const existing = await this.getParticipation(record.subjectId, record.eventId);

    if (existing) {
      const knownTransitions = existing.history.length;
      if (record.history.length < knownTransitions) {
        throw domainError('INVALID_STATE_TRANSITION', 'Participation history cannot shrink');
      }
      const updated = await query(
        'UPDATE participations SET state = $2 WHERE id = $1 AND state = $3',
        [existing.participationId, record.state, existing.state]
      ).catch(translatePgError);
      if (updated.rowCount === 0) {
        throw domainError('VERSION_CONFLICT', `Participation ${existing.participationId} state conflict`);
      }

      const newTransitions = record.history.slice(knownTransitions);
      for (let i = 0; i < newTransitions.length; i++) {
        const t = newTransitions[i];
        await query(
          `INSERT INTO participation_transitions
             (participation_id, seq, from_state, to_state, actor_label, at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [existing.participationId, knownTransitions + i + 1, t.from, t.to, t.actorId, t.at]
        ).catch(translatePgError);
      }
      return;
    }

    await query(
      `INSERT INTO participations (id, subject_entity_id, event_id, state)
       VALUES ($1, $2, $3, $4)`,
      [record.participationId, record.subjectId, record.eventId, record.state]
    ).catch(translatePgError);
  }

  async getIssuerOperatorLink(
    issuerId: string,
    operatorId: string
  ): Promise<IssuerOperatorLink | null> {
    const result = await query<{ active: boolean }>(
      `SELECT active FROM issuer_operators
       WHERE issuer_entity_id = $1 AND operator_account_id = $2`,
      [issuerId, operatorId]
    ).catch(translatePgError);
    const row = result.rows[0];
    if (!row) return null;
    return { issuerId, operatorId, active: row.active };
  }

  async findCredentialByBusinessKey(
    issuerId: string,
    subjectId: string,
    eventId: string,
    credentialType: number
  ): Promise<CredentialRecord | null> {
    const result = await query<CredentialRow>(
      `SELECT * FROM credentials
       WHERE issuer_entity_id = $1 AND subject_entity_id = $2
         AND event_id = $3 AND credential_type = $4`,
      [issuerId, subjectId, eventId, credentialType]
    ).catch(translatePgError);
    return result.rows[0] ? toCredentialRecord(result.rows[0]) : null;
  }

  async getCredentialById(credentialId: string): Promise<CredentialRecord | null> {
    const result = await query<CredentialRow>(
      'SELECT * FROM credentials WHERE id = $1',
      [credentialId]
    ).catch(translatePgError);
    return result.rows[0] ? toCredentialRecord(result.rows[0]) : null;
  }

  async saveCredential(record: CredentialRecord): Promise<void> {
    await query(
      `INSERT INTO credentials (
         id, credential_code, issuer_entity_id, issued_by, subject_entity_id,
         event_id, credential_type, title, description, metadata_hash, hash_schema, status,
         issued_intent_at, issued_ledger, revoked_ledger, revoked_reason_hash,
         revoked_at, revoked_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         issued_ledger = EXCLUDED.issued_ledger,
         revoked_ledger = EXCLUDED.revoked_ledger,
         revoked_reason_hash = EXCLUDED.revoked_reason_hash,
         revoked_at = EXCLUDED.revoked_at,
         revoked_by = EXCLUDED.revoked_by`,
      [
        record.credentialId,
        record.credentialCode,
        record.issuerId,
        record.issuedBy,
        record.subjectId,
        record.eventId,
        record.credentialType,
        record.title,
        record.description,
        record.metadataHash,
        record.hashSchema,
        record.status,
        record.issuedIntentAt,
        record.issuedLedger,
        record.revokedLedger,
        record.revokedReasonHash,
        record.revokedAt,
        record.revokedBy,
      ]
    ).catch(translatePgError);
  }

  async listCredentialsBySubject(subjectId: string): Promise<CredentialRecord[]> {
    const result = await query<CredentialRow>(
      'SELECT * FROM credentials WHERE subject_entity_id = $1 ORDER BY issued_intent_at ASC',
      [subjectId]
    ).catch(translatePgError);
    return result.rows.map(toCredentialRecord);
  }

  async listRelationshipEdges(
    types: readonly RelationshipType[]
  ): Promise<readonly (readonly [string, string])[]> {
    const result = await query<{ from_entity_id: string; to_entity_id: string }>(
      `SELECT from_entity_id, to_entity_id FROM relationships
       WHERE relationship_type = ANY($1::relationship_kind[]) AND status = 'active'`,
      [[...types]]
    ).catch(translatePgError);
    return result.rows.map((r) => [r.from_entity_id, r.to_entity_id] as const);
  }
}
