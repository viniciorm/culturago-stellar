'use server';

import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { query } from '@/infrastructure/database/pool';
import { requireActorFromSession } from '@/infrastructure/auth/getActorFromSession';
import { assertIssuerScope } from '@/infrastructure/auth/actorContext';
import { domainError } from '@/domain/errors';
import { createStellarGateway } from '@/infrastructure/stellar/createStellarGateway';
import { PostgreSQLDatabaseGateway } from '@/infrastructure/database/PostgreSQLDatabaseGateway';
import {
  computeMetadataHash,
  credentialTypeToNumber,
  numberToCredentialType,
} from '@/lib/credentialMetadata';
import {
  db,
  Credential,
  Entity,
  Event,
  PopulatedCredential,
  StellarStatus,
  WalletStatus,
} from '@/lib/db';

function deriveStellarStatus(phase: string | null): StellarStatus {
  if (!phase) return 'not_registered';
  if (phase === 'confirmed') return 'registered';
  if (phase === 'failed_retryable' || phase === 'failed_terminal' || phase === 'unknown') return 'failed';
  return 'pending';
}

function toWalletStatus(value: string | null): WalletStatus {
  if (!value) return 'none';
  if (value === 'claimed' || value === 'reserved' || value === 'none') return value;
  return 'none';
}

function toDateString(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

interface RawCredentialRow {
  id: string;
  credential_code: string;
  issuer_entity_id: string;
  subject_entity_id: string;
  event_id: string;
  credential_type: number;
  title: string;
  description: string | null;
  metadata_hash: string;
  hash_schema: number;
  status: 'issued' | 'revoked';
  issued_intent_at: string | Date;
  issued_ledger: number | null;
  revoked_ledger: number | null;
  revoked_reason_hash: string | null;
  revoked_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  issuer_display_name: string;
  subject_display_name: string;
  event_name: string;
  event_slug: string;
  event_year: number;
  event_start_date: string;
  stellar_phase: string | null;
  stellar_tx_hash: string | null;
}

function mapRowToCredential(row: RawCredentialRow): PopulatedCredential {
  const issuedAt = toDateString(row.issued_intent_at) ?? new Date().toISOString();
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at;

  const credential: Credential = {
    id: row.id,
    credential_code: row.credential_code,
    issuer_entity_id: row.issuer_entity_id,
    subject_entity_id: row.subject_entity_id,
    event_id: row.event_id,
    credential_type: numberToCredentialType[row.credential_type] ?? String(row.credential_type),
    title: row.title,
    description: row.description,
    status: row.status,
    metadata_hash: row.metadata_hash,
    stellar_status: deriveStellarStatus(row.stellar_phase),
    stellar_tx: row.stellar_tx_hash,
    issued_at: issuedAt,
    revoked_at: toDateString(row.revoked_at),
    created_at: createdAt,
    updated_at: updatedAt,
  };

  const issuerEntity: Entity = {
    id: row.issuer_entity_id,
    type: 'organization',
    display_name: row.issuer_display_name,
    slug: '',
    country: 'Chile',
    city: 'Santiago',
    status: 'verified',
    is_public: true,
    stellar_status: 'not_registered',
    wallet_status: 'none',
    created_at: createdAt,
    updated_at: updatedAt,
  };

  const subjectEntity: Entity = {
    id: row.subject_entity_id,
    type: 'person',
    display_name: row.subject_display_name,
    slug: '',
    country: 'Chile',
    city: 'Santiago',
    status: 'verified',
    is_public: true,
    stellar_status: 'not_registered',
    wallet_status: 'none',
    created_at: createdAt,
    updated_at: updatedAt,
  };

  const event: Event = {
    id: row.event_id,
    entity_id: row.event_id,
    name: row.event_name,
    slug: row.event_slug,
    year: row.event_year,
    start_date: row.event_start_date,
    created_at: createdAt,
    updated_at: updatedAt,
  };

  return {
    ...credential,
    title: row.title,
    description: row.description,
    issuerEntity,
    subjectEntity,
    event,
  };
}

/**
 * Lists credentials from PostgreSQL, fully populated with issuer, subject and
 * event display names. Falls back to the demo mock when no DB is configured.
 */
export async function listCredentials(): Promise<PopulatedCredential[]> {
  if (!isPersistenceConfigured()) {
    return db.getCredentials();
  }

  const result = await query<RawCredentialRow>(`
    SELECT
      c.id,
      c.credential_code,
      c.issuer_entity_id,
      c.subject_entity_id,
      c.event_id,
      c.credential_type,
      c.metadata_hash,
      c.hash_schema,
      c.status,
      c.issued_intent_at,
      c.issued_ledger,
      c.revoked_ledger,
      c.revoked_reason_hash,
      c.revoked_at,
      c.created_at,
      c.updated_at,
      ie.display_name AS issuer_display_name,
      c.title,
      c.description,
      se.display_name AS subject_display_name,
      e.name AS event_name,
      e.slug AS event_slug,
      e.year AS event_year,
      e.start_date AS event_start_date,
      so.phase AS stellar_phase,
      so.tx_hash AS stellar_tx_hash
    FROM credentials c
    JOIN entities ie ON ie.id = c.issuer_entity_id
    JOIN entities se ON se.id = c.subject_entity_id
    JOIN events e ON e.entity_id = c.event_id
    LEFT JOIN LATERAL (
      SELECT phase, tx_hash
      FROM stellar_operations
      WHERE subject_key = culturago_canonical_hash('culturago.credential.v1', c.id::text)
        AND operation_type = 'issue_credential'
      ORDER BY
        CASE phase WHEN 'confirmed' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    ) so ON true
    ORDER BY c.issued_intent_at DESC
  `);

  return result.rows.map(mapRowToCredential);
}

interface CreateCredentialInput {
  credential_code: string;
  issuer_entity_id: string;
  subject_entity_id: string;
  event_id: string;
  credential_type: string;
  title: string;
  description?: string | null;
  status: 'issued';
  issued_at: string;
}

/**
 * Inserts a new credential into PostgreSQL. The metadata hash is a SHA-256 of
 * the canonical credential payload; the hash_schema is fixed at 1 for the
 * dashboard admin UI. Falls back to the demo mock when no DB is configured.
 */
export async function createCredential(input: CreateCredentialInput): Promise<void> {
  if (!isPersistenceConfigured()) {
    await db.createCredential({
      ...input,
      metadata_hash: null,
      stellar_status: 'not_registered',
      stellar_tx: null,
    });
    return;
  }

  const credentialType = credentialTypeToNumber[input.credential_type];
  if (!credentialType) {
    throw new Error(`Unknown credential type: ${input.credential_type}`);
  }

  const metadataPayload = {
    credential_code: input.credential_code,
    issuer_entity_id: input.issuer_entity_id,
    subject_entity_id: input.subject_entity_id,
    event_id: input.event_id,
    credential_type: input.credential_type,
    title: input.title,
    description: input.description ?? null,
    issued_at: input.issued_at,
  };

  const actor = await requireActorFromSession();
  assertIssuerScope(actor, input.issuer_entity_id);

  const metadataHash = computeMetadataHash(metadataPayload);
  const hashSchema = 1;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await query(
    `INSERT INTO credentials (
      id, credential_code, issuer_entity_id, issued_by, subject_entity_id,
      event_id, credential_type, metadata_hash, hash_schema, status, title, description,
      issued_intent_at, issued_ledger, revoked_ledger, revoked_reason_hash,
      revoked_at, revoked_by, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
      id,
      input.credential_code,
      input.issuer_entity_id,
      actor.accountId,
      input.subject_entity_id,
      input.event_id,
      credentialType,
      metadataHash,
      hashSchema,
      input.status,
      input.title,
      input.description ?? null,
      input.issued_at,
      null,
      null,
      null,
      null,
      null,
      now,
      now,
    ]
  );
}

interface UpdateCredentialInput {
  status?: 'issued' | 'revoked';
  revoked_at?: string;
}

/**
 * Updates a credential status (e.g., revoke) in PostgreSQL. Falls back to the
 * demo mock when no DB is configured.
 */
export async function updateCredential(
  credentialId: string,
  input: UpdateCredentialInput
): Promise<void> {
  if (!isPersistenceConfigured()) {
    await db.updateCredential(credentialId, input);
    return;
  }

  const setFields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (input.status !== undefined) {
    setFields.push(`status = $${idx++}`);
    values.push(input.status);
  }

  if (input.revoked_at !== undefined) {
    setFields.push(`revoked_at = $${idx++}`);
    values.push(input.revoked_at);
  }

  if (setFields.length === 0) return;

  setFields.push(`updated_at = $${idx++}`);
  values.push(new Date().toISOString());
  values.push(credentialId);

  await query(
    `UPDATE credentials SET ${setFields.join(', ')} WHERE id = $${idx}`,
    values
  );
}

interface RawEntityRow {
  id: string;
  kind: 'person' | 'organization' | 'provider' | 'event';
  display_name: string;
  slug: string;
  country: string;
  city: string;
  status: 'draft' | 'pending' | 'verified' | 'archived';
  is_public: boolean;
  active: boolean;
  latest_version: number;
  created_at: string | Date;
  updated_at: string | Date;
  wallet_address: string | null;
  wallet_status: 'none' | 'reserved' | 'claimed' | 'disabled' | null;
  metadata_hash: string | null;
  stellar_phase: string | null;
  stellar_tx_hash: string | null;
}

function mapRowToEntity(row: RawEntityRow): Entity {
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at;

  return {
    id: row.id,
    type: row.kind,
    display_name: row.display_name,
    slug: row.slug,
    country: row.country,
    city: row.city,
    status: row.status,
    metadata_hash: row.metadata_hash,
    stellar_status: deriveStellarStatus(row.stellar_phase),
    stellar_tx: row.stellar_tx_hash,
    wallet_address: row.wallet_address,
    wallet_status: toWalletStatus(row.wallet_status),
    is_public: row.is_public,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

/**
 * Lists all active entities (people, organizations, providers, events) from
 * PostgreSQL, falling back to the in-memory demo mock when persistence is not
 * configured.
 */
export async function listEntities(): Promise<Entity[]> {
  if (!isPersistenceConfigured()) {
    return db.getEntities();
  }

  const result = await query<RawEntityRow>(`
    SELECT
      e.id,
      e.kind,
      e.display_name,
      e.slug,
      e.country,
      e.city,
      e.status,
      e.is_public,
      e.active,
      e.latest_version,
      e.created_at,
      e.updated_at,
      w.wallet_address,
      w.wallet_status,
      ev.metadata_hash,
      so.phase AS stellar_phase,
      so.tx_hash AS stellar_tx_hash
    FROM entities e
    LEFT JOIN LATERAL (
      SELECT wallet_address, wallet_status
      FROM wallets
      WHERE entity_id = e.id
      ORDER BY
        CASE wallet_status
          WHEN 'claimed' THEN 0
          WHEN 'reserved' THEN 1
          WHEN 'none' THEN 2
          ELSE 3
        END,
        created_at DESC
      LIMIT 1
    ) w ON true
    LEFT JOIN LATERAL (
      SELECT metadata_hash
      FROM entity_versions
      WHERE entity_id = e.id
      ORDER BY version DESC
      LIMIT 1
    ) ev ON true
    LEFT JOIN LATERAL (
      SELECT phase, tx_hash
      FROM stellar_operations
      WHERE subject_key = culturago_canonical_hash('culturago.entity.v1', e.id::text)
        AND operation_type = 'register_entity'
      ORDER BY
        CASE phase WHEN 'confirmed' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    ) so ON true
    WHERE e.active = true
    ORDER BY e.display_name
  `);

  return result.rows.map(mapRowToEntity);
}

export async function prepareCredentialIssue(credentialId: string): Promise<string> {
  if (!isPersistenceConfigured()) {
    throw domainError('INTERNAL', 'Se requiere DATABASE_URL para preparar operaciones Stellar');
  }

  const actor = await requireActorFromSession();
  const dbGateway = new PostgreSQLDatabaseGateway();

  const record = await dbGateway.getCredentialById(credentialId);
  if (!record) {
    throw domainError('NOT_FOUND', `Credencial ${credentialId} no encontrada`);
  }

  if (record.status !== 'issued') {
    throw domainError('INVALID_STATE_TRANSITION', 'Solo credenciales emitidas pueden prepararse en Stellar');
  }

  assertIssuerScope(actor, record.issuerId);

  const accountResult = await query<{ wallet_contract_address: string | null }>(
    'SELECT wallet_contract_address FROM accounts WHERE id = $1',
    [actor.accountId]
  );
  const actorAddress = accountResult.rows[0]?.wallet_contract_address;
  if (!actorAddress) {
    throw domainError('NOT_FOUND', 'La cuenta del operador no tiene smart wallet desplegada');
  }

  const { gateway } = createStellarGateway();
  const state = await gateway.prepareIssueCredential({
    idempotencyKey: record.credentialId,
    actorAddress,
    credentialId: record.credentialId,
    issuerId: record.issuerId,
    subjectId: record.subjectId,
    eventId: record.eventId,
    credentialType: record.credentialType,
    metadataHash: record.metadataHash,
    hashSchema: record.hashSchema,
  });

  return state.operationId;
}
