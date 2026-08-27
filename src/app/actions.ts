'use server';

import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { query } from '@/infrastructure/database/pool';
import { numberToCredentialType } from '@/lib/credentialMetadata';
import type { Entity, Credential, PopulatedCredential, Event } from '@/domain/types/entities';

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

function toDateString(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toWalletStatus(value: string | null): Entity['wallet_status'] {
  if (!value) return 'none';
  if (value === 'claimed' || value === 'reserved' || value === 'none') return value;
  return 'none';
}

function deriveStellarStatus(phase: string | null): Entity['stellar_status'] {
  if (!phase) return 'not_registered';
  if (phase === 'confirmed') return 'registered';
  if (phase === 'failed_retryable' || phase === 'failed_terminal' || phase === 'unknown') return 'failed';
  return 'pending';
}

function mapRowToEntity(row: RawEntityRow): Entity {
  const createdAt = toDateString(row.created_at) ?? new Date().toISOString();
  const updatedAt = toDateString(row.updated_at) ?? new Date().toISOString();
  return {
    id: row.id,
    type: row.kind,
    display_name: row.display_name,
    slug: row.slug,
    country: row.country,
    city: row.city,
    status: row.status,
    is_public: row.is_public,
    metadata_hash: row.metadata_hash,
    stellar_status: deriveStellarStatus(row.stellar_phase),
    stellar_tx: row.stellar_tx_hash,
    wallet_address: row.wallet_address,
    wallet_status: toWalletStatus(row.wallet_status),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

/**
 * List public, active entities for the landing page and public search.
 */
export async function getPublicEntities(): Promise<Entity[]> {
  if (!isPersistenceConfigured()) {
    return [];
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
    WHERE e.active = true AND e.is_public = true
    ORDER BY e.display_name
  `);

  return result.rows.map(mapRowToEntity);
}

interface PublicCredentialRow {
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
  status: 'draft' | 'issued' | 'revoked';
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

function mapRowToPopulatedCredential(row: PublicCredentialRow): PopulatedCredential {
  const issuedAt = toDateString(row.issued_intent_at) ?? new Date().toISOString();
  const createdAt = toDateString(row.created_at) ?? new Date().toISOString();
  const updatedAt = toDateString(row.updated_at) ?? new Date().toISOString();

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
    end_date: null,
    location: null,
    address: null,
    description: null,
    organizer_entity_id: null,
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

export async function getPublicCredentialByCode(code: string): Promise<PopulatedCredential | null> {
  if (!isPersistenceConfigured()) {
    return null;
  }

  const result = await query<PublicCredentialRow>(`
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
      c.title,
      c.description,
      ie.display_name AS issuer_display_name,
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
    WHERE c.credential_code = $1
    LIMIT 1
  `, [code]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToPopulatedCredential(result.rows[0]);
}
