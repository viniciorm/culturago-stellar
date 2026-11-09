import 'server-only';
import { IndexedEvent } from '../../ports/StellarIndexer';
import { query, translatePgError } from '../database/pool';

interface IndexedEventRow {
  network: string;
  contract_id: string;
  ledger: number;
  event_index: number;
  event_type: string;
  entity_id: string | null;
  credential_id: string | null;
  subject_id: string | null;
  issuer_id: string | null;
  event_entity_id: string | null;
  data: Record<string, unknown>;
  recorded_at: string;
}

export interface PassportEntry {
  credentialId: string;
  eventId: string;
  issuerId: string;
  status: 'issued' | 'revoked';
  ledger: number;
  recordedAt: Date;
  data: Record<string, unknown>;
}

export interface PublicCredentialView {
  credentialId: string;
  status: 'issued' | 'revoked' | 'unverified';
  verifiedOnChain: boolean;
  onChain: {
    exists: boolean;
    matches: boolean;
    revoked: boolean;
    ledger: number | null;
  };
  ledger: number | null;
  network: string;
  contractId: string;
  canonical: {
    digest: string | null;
    schema: number | null;
  };
}

export function toPublicCredentialView(event: IndexedEvent): PublicCredentialView {
  const revoked = event.eventType === 'CredentialRevoked';
  return {
    credentialId: event.credentialId ?? '',
    status: revoked ? 'revoked' : 'issued',
    verifiedOnChain: true,
    onChain: {
      exists: true,
      matches: true,
      revoked,
      ledger: event.ledger,
    },
    ledger: event.ledger,
    network: event.network,
    contractId: event.contractId,
    canonical: {
      digest: typeof event.data.metadata_hash === 'string' ? event.data.metadata_hash : null,
      schema: typeof event.data.hash_schema === 'number' ? event.data.hash_schema : null,
    },
  };
}

/**
 * Passport timeline: reconstructs the subject/event credential history from
 * the immutable indexed event log. The projection is rebuilt, never mutated
 * by delete/update.
 */
export class PassportService {
  async getPassport(subjectId: string, eventId: string): Promise<PassportEntry[]> {
    const result = await query<IndexedEventRow>(
      `SELECT
         sie.network,
         sie.contract_id,
         sie.ledger,
         COALESCE(se.event_index, 0) AS event_index,
         sie.event_type,
         sie.entity_id,
         sie.credential_id,
         sie.subject_id,
         sie.issuer_id,
         sie.event_entity_id,
         sie.data,
         sie.recorded_at
       FROM stellar_indexed_events sie
       LEFT JOIN stellar_events se ON se.id = sie.source_event_id
       WHERE sie.subject_id = $1 AND sie.event_entity_id = $2
       ORDER BY sie.ledger ASC, COALESCE(se.event_index, 0) ASC, sie.recorded_at ASC`,
      [subjectId, eventId]
    ).catch(translatePgError);

    const latestByCredential = new Map<string, IndexedEventRow>();
    for (const row of result.rows) {
      if (row.credential_id) latestByCredential.set(row.credential_id, row);
    }

    return [...latestByCredential.entries()].map(([credentialId, row]) => ({
      credentialId,
      eventId: row.event_entity_id ?? eventId,
      issuerId: row.issuer_id ?? '',
      status: row.event_type === 'CredentialRevoked' ? 'revoked' : 'issued',
      ledger: row.ledger,
      recordedAt: new Date(row.recorded_at),
      data: row.data,
    }));
  }

  /** Verify a credential against the indexed events (not the live chain). */
  async verifyIndexedCredential(credentialId: string): Promise<IndexedEvent | null> {
    const result = await query<IndexedEventRow>(
      `SELECT
         sie.network,
         sie.contract_id,
         sie.ledger,
         COALESCE(se.event_index, 0) AS event_index,
         sie.event_type,
         sie.entity_id,
         sie.credential_id,
         sie.subject_id,
         sie.issuer_id,
         sie.event_entity_id,
         sie.data,
         sie.recorded_at
       FROM stellar_indexed_events sie
       LEFT JOIN stellar_events se ON se.id = sie.source_event_id
       WHERE sie.credential_id = $1
          OR sie.credential_id = culturago_canonical_hash('culturago.credential.v1', to_json($1::text)::text)
       ORDER BY sie.ledger DESC, COALESCE(se.event_index, 0) DESC, sie.recorded_at DESC
       LIMIT 1`,
      [credentialId]
    ).catch(translatePgError);
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      network: row.network,
      contractId: row.contract_id,
      ledger: row.ledger,
      eventIndex: row.event_index ?? 0,
      eventType: row.event_type,
      entityId: row.entity_id,
      credentialId: row.credential_id,
      subjectId: row.subject_id ?? (row.data.subject_id as string | undefined) ?? null,
      issuerId: row.issuer_id,
      eventEntityId: row.event_entity_id,
      data: row.data,
    };
  }
}
