import 'server-only';
import { PoolClient } from 'pg';
import {
  ContractEvent,
  StellarIndexer,
} from '../../ports/StellarIndexer';
import { query, translatePgError, withTransaction } from '../database/pool';

/**
 * PostgreSQL-backed indexer: deduplicates raw events, derives the indexed
 * view, and persists per-contract cursors in a single transaction.
 */
export class PostgreSQLIndexer implements StellarIndexer {
  async ingest(events: ContractEvent[]): Promise<{ inserted: number; deduplicated: number }> {
    return withTransaction(async (client: PoolClient) => {
      let inserted = 0;
      let deduplicated = 0;
      for (const event of events) {
        try {
          await client.query(
            `INSERT INTO stellar_events (
              network, contract_id, ledger, event_index, event_type,
              topics, data, tx_hash
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              event.network,
              event.contractId,
              event.ledger,
              event.eventIndex,
              event.eventType,
              event.topics,
              JSON.stringify(event.data),
              event.txHash,
            ]
          );
          inserted++;
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code === '23505') {
            deduplicated++;
          } else {
            throw error;
          }
        }
      }
      return { inserted, deduplicated };
    }).catch(translatePgError);
  }

  async processUnprocessed(network: string, contractId: string): Promise<number> {
    return withTransaction(async (client: PoolClient) => {
      const unprocessed = await client.query<{
        id: string;
        ledger: number;
        event_index: number;
        event_type: string;
        data: Record<string, unknown>;
      }>(
        `SELECT id, ledger, event_index, event_type, data
         FROM stellar_events
         WHERE network = $1 AND contract_id = $2 AND processed_at IS NULL
         ORDER BY ledger, event_index
         FOR UPDATE`,
        [network, contractId]
      );

      for (const row of unprocessed.rows) {
        const d = row.data;
        await client.query(
          `INSERT INTO stellar_indexed_events (
            source_event_id, network, contract_id, ledger, event_index,
            event_type, entity_id, credential_id, subject_id, issuer_id,
            event_entity_id, data
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (network, contract_id, ledger, source_event_id) DO NOTHING`,
          [
            row.id,
            network,
            contractId,
            row.ledger,
            row.event_index,
            row.event_type,
            (d.entity_id as string | undefined) ?? null,
            (d.credential_id as string | undefined) ?? null,
            (d.subject_id as string | undefined) ?? null,
            (d.issuer_id as string | undefined) ?? null,
            (d.event_id as string | undefined) ?? null,
            JSON.stringify(d),
          ]
        );
        await client.query(
          'UPDATE stellar_events SET processed_at = NOW() WHERE id = $1',
          [row.id]
        );
      }
      return unprocessed.rows.length;
    }).catch(translatePgError);
  }

  async getCursor(network: string, contractId: string): Promise<number | null> {
    const result = await query<{ last_ledger: number }>(
      'SELECT last_ledger FROM stellar_cursors WHERE network = $1 AND contract_id = $2',
      [network, contractId]
    ).catch(translatePgError);
    return result.rows[0]?.last_ledger ?? null;
  }

  async setCursor(network: string, contractId: string, ledger: number): Promise<void> {
    await query(
      `INSERT INTO stellar_cursors (network, contract_id, last_ledger)
       VALUES ($1, $2, $3)
       ON CONFLICT (network, contract_id) DO UPDATE SET last_ledger = EXCLUDED.last_ledger, updated_at = NOW()`,
      [network, contractId, ledger]
    ).catch(translatePgError);
  }

  async rebuildProjections(): Promise<void> {
    await query(
      `DELETE FROM stellar_indexed_events;
       INSERT INTO stellar_indexed_events (
         source_event_id, network, contract_id, ledger, event_index,
         event_type, entity_id, credential_id, subject_id, issuer_id,
         event_entity_id, data
       )
       SELECT
         e.id, e.network, e.contract_id, e.ledger, e.event_index,
         e.event_type,
         e.data->>'entity_id',
         e.data->>'credential_id',
         e.data->>'subject_id',
         e.data->>'issuer_id',
         e.data->>'event_id',
         e.data
       FROM stellar_events e
       WHERE e.processed_at IS NOT NULL;`
    ).catch(translatePgError);
  }
}
