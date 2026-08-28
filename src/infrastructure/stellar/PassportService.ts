import 'server-only';
import { IndexedEvent } from '../../ports/StellarIndexer';
import { query, translatePgError } from '../database/pool';

interface IndexedEventRow {
  ledger: number;
  event_type: string;
  credential_id: string | null;
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
  status: 'issued' | 'revoked';
  ledger: number;
  network: string;
  contractId: string;
  canonical: {
    digest: string | null;
    schema: number | null;
  };
}

export function toPublicCredentialView(event: IndexedEvent): PublicCredentialView {
  return {
    credentialId: event.credentialId ?? '',
    status: event.eventType === 'CredentialRevoked' ? 'revoked' : 'issued',
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
      `SELECT ledger, event_type, credential_id, issuer_id, event_entity_id, data, recorded_at
       FROM stellar_indexed_events
       WHERE subject_id = $1 AND event_entity_id = $2
       ORDER BY ledger, event_index`,
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
      `SELECT * FROM stellar_indexed_events
       WHERE credential_id = $1
       ORDER BY ledger DESC, event_index DESC
       LIMIT 1`,
      [credentialId]
    ).catch(translatePgError);
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      network: 'testnet',
      contractId: 'CCRED',
      ledger: row.ledger,
      eventIndex: 0,
      eventType: row.event_type,
      entityId: null,
      credentialId: row.credential_id,
      subjectId: (row.data.subject_id as string | undefined) ?? null,
      issuerId: row.issuer_id,
      eventEntityId: row.event_entity_id,
      data: row.data,
    };
  }
}
