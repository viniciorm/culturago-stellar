'use server';

import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { query } from '@/infrastructure/database/pool';
import { requireDashboardAdmin } from '@/infrastructure/auth/dashboardGuard';
import type {
  Entity,
  Event,
  Organization,
  PopulatedCredential,
  PopulatedRelationship,
  Person,
  Provider,
  Relationship,
} from '@/domain/types/entities';
import {
  listEntities as listEntitiesAction,
  listCredentials as listCredentialsAction,
  createCredential as createCredentialAction,
  updateCredential as updateCredentialAction,
} from '../credenciales/actions';
import {
  listRelationships as listRelationshipsAction,
  createRelationship as createRelationshipAction,
} from '../configuracion/actions';
import {
  listPeople as listPeopleAction,
  createPerson as createPersonAction,
} from '../personas/actions';
import {
  listOrganizations as listOrganizationsAction,
  createOrganization as createOrganizationAction,
} from '../organizaciones/actions';
import {
  listProviders as listProvidersAction,
  createProvider as createProviderAction,
} from '../proveedores/actions';

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

interface RawOrgRow extends RawEntityRow {
  organization_type: Organization['organization_type'];
  website: string | null;
  instagram: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
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

export async function getEventBySlug(slug: string): Promise<(Event & { entity: Entity }) | null> {
  if (!isPersistenceConfigured()) {
    return null;
  }

  await requireDashboardAdmin();

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
    WHERE e.kind = 'event' AND e.slug = $1
    LIMIT 1
  `, [slug]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToEvent(result.rows[0]);
}

export async function getOrganizationByEntityId(
  entityId: string
): Promise<(Organization & { entity: Entity }) | null> {
  if (!isPersistenceConfigured()) {
    return null;
  }

  await requireDashboardAdmin();

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
    WHERE e.kind = 'organization' AND e.id = $1
    LIMIT 1
  `, [entityId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToOrganization(result.rows[0]);
}

export async function getEntities(): Promise<Entity[]> {
  return listEntitiesAction();
}

export async function getRelationships(): Promise<PopulatedRelationship[]> {
  return listRelationshipsAction();
}

export async function getCredentials(): Promise<PopulatedCredential[]> {
  return listCredentialsAction();
}

export async function getPeople(): Promise<(Person & { entity: Entity })[]> {
  return listPeopleAction();
}

export async function getOrganizations(): Promise<(Organization & { entity: Entity })[]> {
  return listOrganizationsAction();
}

export async function getProviders(): Promise<(Provider & { entity: Entity })[]> {
  return listProvidersAction();
}

export async function createPerson(
  entityData: unknown,
  personData: unknown
): Promise<{ entity_id: string }> {
  const entityId = await createPersonAction(
    entityData as Parameters<typeof createPersonAction>[0],
    personData as Parameters<typeof createPersonAction>[1]
  );
  return { entity_id: entityId };
}

export async function createOrganization(
  entityData: unknown,
  orgData: unknown
): Promise<{ entity_id: string }> {
  const entityId = await createOrganizationAction(
    entityData as Parameters<typeof createOrganizationAction>[0],
    orgData as Parameters<typeof createOrganizationAction>[1]
  );
  return { entity_id: entityId };
}

export async function createProvider(
  entityData: unknown,
  providerData: unknown
): Promise<{ entity_id: string }> {
  const entityId = await createProviderAction(
    entityData as Parameters<typeof createProviderAction>[0],
    providerData as Parameters<typeof createProviderAction>[1]
  );
  return { entity_id: entityId };
}

export async function createCredential(credentialData: unknown): Promise<void> {
  return createCredentialAction(credentialData as Parameters<typeof createCredentialAction>[0]);
}

export async function updateCredential(
  credentialId: string,
  input: unknown
): Promise<void> {
  return updateCredentialAction(
    credentialId,
    input as Parameters<typeof updateCredentialAction>[1]
  );
}

export async function createRelationship(
  input: Omit<Relationship, 'id' | 'created_at' | 'updated_at'>
): Promise<Relationship> {
  return createRelationshipAction(input);
}
