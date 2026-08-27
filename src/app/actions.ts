'use server';

import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { query } from '@/infrastructure/database/pool';
import { numberToCredentialType } from '@/lib/credentialMetadata';
import type { Entity, Credential, PopulatedCredential, Event, Relationship, PopulatedRelationship, Person, Organization, Provider } from '@/domain/types/entities';

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
      WHERE subject_key = culturago_canonical_hash('culturago.entity.v1', to_json(e.id)::text)
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
      WHERE subject_key = culturago_canonical_hash('culturago.credential.v1', to_json(c.id)::text)
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

interface RawEventRow extends RawEntityRow {
  event_name: string;
  event_slug: string;
  year: number;
  start_date: string;
  end_date: string | null;
  location: string | null;
  address: string | null;
  description: string | null;
  organizer_entity_id: string | null;
}

function mapRowToEvent(row: RawEventRow): Event & { entity: Entity } {
  const createdAt = toDateString(row.created_at) ?? new Date().toISOString();
  const updatedAt = toDateString(row.updated_at) ?? new Date().toISOString();

  const event: Event = {
    id: row.id,
    entity_id: row.id,
    name: row.event_name,
    slug: row.event_slug,
    year: row.year,
    start_date: row.start_date,
    end_date: row.end_date,
    location: row.location,
    address: row.address,
    description: row.description,
    organizer_entity_id: row.organizer_entity_id,
    created_at: createdAt,
    updated_at: updatedAt,
  };

  return { ...event, entity: mapRowToEntity(row) };
}

export async function getPublicEventBySlug(slug: string): Promise<(Event & { entity: Entity }) | null> {
  if (!isPersistenceConfigured()) {
    return null;
  }

  const result = await query<RawEventRow>(`
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
      so.tx_hash AS stellar_tx_hash,
      ev2.name AS event_name,
      ev2.slug AS event_slug,
      ev2.year,
      ev2.start_date,
      ev2.end_date,
      ev2.location,
      ev2.address,
      ev2.description,
      ev2.organizer_entity_id
    FROM entities e
    JOIN events ev2 ON ev2.entity_id = e.id
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
      WHERE subject_key = culturago_canonical_hash('culturago.entity.v1', to_json(e.id)::text)
        AND operation_type = 'register_entity'
      ORDER BY
        CASE phase WHEN 'confirmed' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    ) so ON true
    WHERE e.kind = 'event' AND e.active = true AND e.is_public = true AND e.slug = $1
    LIMIT 1
  `, [slug]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToEvent(result.rows[0]);
}

interface PublicRelationshipRow {
  id: string;
  from_entity_id: string;
  to_entity_id: string;
  relationship_type: string;
  context_event_id: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  from_display_name: string;
  from_kind: 'person' | 'organization' | 'provider' | 'event';
  to_display_name: string;
  to_kind: 'person' | 'organization' | 'provider' | 'event';
}

function mapRowToPublicRelationship(row: PublicRelationshipRow): PopulatedRelationship {
  const createdAt = toDateString(row.created_at) ?? new Date().toISOString();
  const updatedAt = toDateString(row.updated_at) ?? new Date().toISOString();

  const fromEntity: Entity = {
    id: row.from_entity_id,
    type: row.from_kind,
    display_name: row.from_display_name,
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

  const toEntity: Entity = {
    id: row.to_entity_id,
    type: row.to_kind,
    display_name: row.to_display_name,
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

  const relationship: Relationship = {
    id: row.id,
    from_entity_id: row.from_entity_id,
    to_entity_id: row.to_entity_id,
    relationship_type: row.relationship_type as Relationship['relationship_type'],
    context_event_id: row.context_event_id,
    status: row.status as Relationship['status'],
    start_date: toDateString(row.start_date),
    end_date: toDateString(row.end_date),
    notes: row.notes,
    created_at: createdAt,
    updated_at: updatedAt,
  };

  return { ...relationship, fromEntity, toEntity };
}

export async function getPublicRelationships(): Promise<PopulatedRelationship[]> {
  if (!isPersistenceConfigured()) {
    return [];
  }

  const result = await query<PublicRelationshipRow>(`
    SELECT
      r.id,
      r.from_entity_id,
      r.to_entity_id,
      r.relationship_type::text,
      r.context_event_id,
      r.status::text,
      r.start_date,
      r.end_date,
      r.notes,
      r.created_at,
      r.updated_at,
      fe.display_name AS from_display_name,
      fe.kind::text AS from_kind,
      te.display_name AS to_display_name,
      te.kind::text AS to_kind
    FROM relationships r
    JOIN entities fe ON fe.id = r.from_entity_id
    JOIN entities te ON te.id = r.to_entity_id
    WHERE r.status = 'active'
    ORDER BY r.created_at DESC
  `);

  return result.rows.map(mapRowToPublicRelationship);
}

interface RawPersonRow extends RawEntityRow {
  legal_name: string | null;
  artistic_name: string;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  bio: string | null;
  photo_url: string | null;
  main_role: 'dancer' | 'teacher' | 'director' | 'judge' | 'guest' | 'staff' | 'other';
}

function mapRowToPerson(row: RawPersonRow): Person & { entity: Entity } {
  const createdAt = toDateString(row.created_at) ?? new Date().toISOString();
  const updatedAt = toDateString(row.updated_at) ?? new Date().toISOString();

  const person: Person = {
    id: row.id,
    entity_id: row.id,
    legal_name: row.legal_name,
    artistic_name: row.artistic_name,
    email: row.email,
    phone: row.phone,
    instagram: row.instagram,
    bio: row.bio,
    photo_url: row.photo_url,
    main_role: row.main_role,
    created_at: createdAt,
    updated_at: updatedAt,
  };

  return { ...person, entity: mapRowToEntity(row) };
}

export async function getPublicPersonByEntityId(
  entityId: string
): Promise<(Person & { entity: Entity }) | null> {
  if (!isPersistenceConfigured()) {
    return null;
  }

  const result = await query<RawPersonRow>(`
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
      p.legal_name,
      p.artistic_name,
      p.email,
      p.phone,
      p.instagram,
      p.bio,
      p.photo_url,
      p.main_role,
      w.wallet_address,
      w.wallet_status,
      ev.metadata_hash,
      so.phase AS stellar_phase,
      so.tx_hash AS stellar_tx_hash
    FROM entities e
    JOIN people p ON p.entity_id = e.id
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
      WHERE subject_key = culturago_canonical_hash('culturago.entity.v1', to_json(e.id)::text)
        AND operation_type = 'register_entity'
      ORDER BY
        CASE phase WHEN 'confirmed' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    ) so ON true
    WHERE e.kind = 'person' AND e.active = true AND e.is_public = true AND e.id = $1
    LIMIT 1
  `, [entityId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToPerson(result.rows[0]);
}

interface RawOrgRow extends RawEntityRow {
  organization_type: Organization['organization_type'];
  website: string | null;
  instagram: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

function mapRowToOrganization(row: RawOrgRow): Organization & { entity: Entity } {
  const createdAt = toDateString(row.created_at) ?? new Date().toISOString();
  const updatedAt = toDateString(row.updated_at) ?? new Date().toISOString();

  const org: Organization = {
    id: row.id,
    entity_id: row.id,
    name: row.display_name,
    organization_type: row.organization_type,
    website: row.website,
    instagram: row.instagram,
    contact_name: row.contact_name,
    contact_email: row.contact_email,
    contact_phone: row.contact_phone,
    created_at: createdAt,
    updated_at: updatedAt,
  };

  return { ...org, entity: mapRowToEntity(row) };
}

export async function getPublicOrganizationByEntityId(
  entityId: string
): Promise<(Organization & { entity: Entity }) | null> {
  if (!isPersistenceConfigured()) {
    return null;
  }

  const result = await query<RawOrgRow>(`
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
      o.organization_type,
      o.website,
      o.instagram,
      o.contact_name,
      o.contact_email,
      o.contact_phone,
      w.wallet_address,
      w.wallet_status,
      ev.metadata_hash,
      so.phase AS stellar_phase,
      so.tx_hash AS stellar_tx_hash
    FROM entities e
    JOIN organizations o ON o.entity_id = e.id
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
      WHERE subject_key = culturago_canonical_hash('culturago.entity.v1', to_json(e.id)::text)
        AND operation_type = 'register_entity'
      ORDER BY
        CASE phase WHEN 'confirmed' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    ) so ON true
    WHERE e.kind = 'organization' AND e.active = true AND e.is_public = true AND e.id = $1
    LIMIT 1
  `, [entityId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToOrganization(result.rows[0]);
}

interface RawProviderRow extends RawEntityRow {
  provider_type: Provider['provider_type'];
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  website: string | null;
  public_description: string | null;
}

function mapRowToProvider(row: RawProviderRow): Provider & { entity: Entity } {
  const createdAt = toDateString(row.created_at) ?? new Date().toISOString();
  const updatedAt = toDateString(row.updated_at) ?? new Date().toISOString();

  const provider: Provider = {
    id: row.id,
    entity_id: row.id,
    name: row.display_name,
    provider_type: row.provider_type,
    contact_name: row.contact_name,
    email: row.email,
    phone: row.phone,
    instagram: row.instagram,
    website: row.website,
    public_description: row.public_description,
    created_at: createdAt,
    updated_at: updatedAt,
  };

  return { ...provider, entity: mapRowToEntity(row) };
}

export async function getPublicProviderByEntityId(
  entityId: string
): Promise<(Provider & { entity: Entity }) | null> {
  if (!isPersistenceConfigured()) {
    return null;
  }

  const result = await query<RawProviderRow>(`
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
      p.provider_type,
      p.contact_name,
      p.email,
      p.phone,
      p.instagram,
      p.website,
      p.public_description,
      w.wallet_address,
      w.wallet_status,
      ev.metadata_hash,
      so.phase AS stellar_phase,
      so.tx_hash AS stellar_tx_hash
    FROM entities e
    JOIN providers p ON p.entity_id = e.id
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
      WHERE subject_key = culturago_canonical_hash('culturago.entity.v1', to_json(e.id)::text)
        AND operation_type = 'register_entity'
      ORDER BY
        CASE phase WHEN 'confirmed' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    ) so ON true
    WHERE e.kind = 'provider' AND e.active = true AND e.is_public = true AND e.id = $1
    LIMIT 1
  `, [entityId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToProvider(result.rows[0]);
}
