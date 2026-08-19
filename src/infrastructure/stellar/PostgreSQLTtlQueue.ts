import 'server-only';
import { PoolClient } from 'pg';
import { StellarTtlQueue, TtlEntry } from '../../ports/StellarTtlQueue';
import { query, translatePgError, withTransaction } from '../database/pool';

interface TtlRow {
  network: string;
  contract_id: string;
  entry_key: string;
  entry_kind: string;
  expires_at_ledger: number | null;
  last_extended_ledger: number | null;
  status: string;
  alert_sent_at: string | null;
  next_run_at: string;
}

function toEntry(row: TtlRow): TtlEntry {
  return {
    network: row.network,
    contractId: row.contract_id,
    entryKey: row.entry_key,
    entryKind: row.entry_kind as TtlEntry['entryKind'],
    expiresAtLedger: row.expires_at_ledger,
    lastExtendedLedger: row.last_extended_ledger,
    status: row.status as TtlEntry['status'],
    alertSentAt: row.alert_sent_at ? new Date(row.alert_sent_at) : null,
    nextRunAt: new Date(row.next_run_at),
  };
}

export class PostgreSQLTtlQueue implements StellarTtlQueue {
  async upsert(entry: Omit<TtlEntry, 'nextRunAt' | 'status' | 'alertSentAt'>): Promise<void> {
    await query(
      `INSERT INTO stellar_ttl_jobs (
        network, contract_id, entry_key, entry_kind, expires_at_ledger,
        last_extended_ledger
      ) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (network, contract_id, entry_key) DO UPDATE SET
        entry_kind = EXCLUDED.entry_kind,
        expires_at_ledger = EXCLUDED.expires_at_ledger,
        last_extended_ledger = EXCLUDED.last_extended_ledger,
        next_run_at = NOW(),
        updated_at = NOW()`,
      [
        entry.network,
        entry.contractId,
        entry.entryKey,
        entry.entryKind,
        entry.expiresAtLedger,
        entry.lastExtendedLedger,
      ]
    ).catch(translatePgError);
  }

  async claimDue(options: {
    batchSize: number;
    workerId: string;
    ttlSeconds: number;
  }): Promise<TtlEntry[]> {
    return withTransaction(async (client: PoolClient) => {
      const until = new Date(Date.now() + options.ttlSeconds * 1000);
      const result = await client.query<TtlRow>(
        `UPDATE stellar_ttl_jobs
         SET claimed_by = $1,
             claimed_until = $2,
             updated_at = NOW()
         WHERE id IN (
           SELECT id
           FROM stellar_ttl_jobs
           WHERE status IN ('pending','alerted')
             AND next_run_at <= NOW()
             AND (claimed_until IS NULL OR claimed_until <= NOW())
           ORDER BY next_run_at
           FOR UPDATE SKIP LOCKED
           LIMIT $3
         )
         RETURNING *`,
        [options.workerId, until, options.batchSize]
      );
      return result.rows.map(toEntry);
    }).catch(translatePgError);
  }

  async markResult(
    id: Pick<TtlEntry, 'network' | 'contractId' | 'entryKey'>,
    status: 'extended' | 'failed',
    lastExtendedLedger: number | null
  ): Promise<void> {
    await query(
      `UPDATE stellar_ttl_jobs
       SET status = $4,
           last_extended_ledger = $5,
           claimed_by = NULL,
           claimed_until = NULL,
           next_run_at = NOW() + INTERVAL '60 seconds',
           updated_at = NOW()
       WHERE network = $1 AND contract_id = $2 AND entry_key = $3`,
      [id.network, id.contractId, id.entryKey, status, lastExtendedLedger]
    ).catch(translatePgError);
  }

  async getAtRisk(beforeLedger: number): Promise<TtlEntry[]> {
    const result = await query<TtlRow>(
      `SELECT * FROM stellar_ttl_jobs
       WHERE expires_at_ledger <= $1
         AND status IN ('pending','alerted')
       ORDER BY expires_at_ledger
       FOR UPDATE SKIP LOCKED`,
      [beforeLedger]
    ).catch(translatePgError);
    return result.rows.map(toEntry);
  }
}
