'use server';

import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { query } from '@/infrastructure/database/pool';
import { db, Entity, Provider, StellarStatus, WalletStatus } from '@/lib/db';

interface ProviderFormEntityData {
  display_name: string;
  slug: string;
  country: string;
  city: string;
  status: 'draft' | 'pending' | 'verified';
  is_public: boolean;
}

interface ProviderFormProviderData {
  name: string;
  provider_type: Provider['provider_type'];
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  website: string | null;
  public_description: string | null;
}

interface RawProviderRow {
  id: string;
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
  provider_type: Provider['provider_type'];
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  website: string | null;
  public_description: string | null;
  wallet_address: string | null;
  wallet_status: 'none' | 'reserved' | 'claimed' | 'disabled' | null;
  metadata_hash: string | null;
  stellar_phase: string | null;
  stellar_tx_hash: string | null;
}

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

function mapRowToProvider(row: RawProviderRow): Provider & { entity: Entity } {
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at;

  const entity: Entity = {
    id: row.id,
    type: 'provider',
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

  return { ...provider, entity };
}

export async function listProviders(): Promise<(Provider & { entity: Entity })[]> {
  if (!isPersistenceConfigured()) {
    return db.getProviders();
  }

  const result = await query<RawProviderRow>(`
    SELECT
      e.id,
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
      WHERE subject_key = culturago_canonical_hash('culturago.entity.v1', e.id::text)
        AND operation_type = 'register_entity'
      ORDER BY
        CASE phase WHEN 'confirmed' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    ) so ON true
    WHERE e.kind = 'provider' AND e.active = true
    ORDER BY e.display_name
  `);

  return result.rows.map(mapRowToProvider);
}

export async function createProvider(
  entityData: ProviderFormEntityData,
  providerData: ProviderFormProviderData
): Promise<void> {
  if (!isPersistenceConfigured()) {
    await db.createProvider(entityData as any, providerData as any);
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await query(
    `INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active, latest_version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      'provider',
      entityData.display_name,
      entityData.slug,
      entityData.country,
      entityData.city,
      entityData.status,
      entityData.is_public,
      true,
      0,
      now,
      now,
    ]
  );

  await query(
    `INSERT INTO providers (entity_id, provider_type, contact_name, email, phone, instagram, website, public_description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      providerData.provider_type,
      providerData.contact_name,
      providerData.email,
      providerData.phone,
      providerData.instagram,
      providerData.website,
      providerData.public_description,
    ]
  );
}

export async function updateProvider(
  entityId: string,
  entityData: Partial<ProviderFormEntityData>,
  providerData: Partial<ProviderFormProviderData>
): Promise<void> {
  if (!isPersistenceConfigured()) {
    await db.updateProvider(entityId, entityData as any, providerData as any);
    return;
  }

  const now = new Date().toISOString();

  if (Object.keys(entityData).length > 0) {
    const setFields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const add = (field: string, value: unknown) => {
      if (value !== undefined) {
        setFields.push(`${field} = $${idx++}`);
        values.push(value);
      }
    };

    add('display_name', entityData.display_name);
    add('slug', entityData.slug);
    add('country', entityData.country);
    add('city', entityData.city);
    add('status', entityData.status);
    add('is_public', entityData.is_public);
    setFields.push(`updated_at = $${idx++}`);
    values.push(now);
    values.push(entityId);

    if (setFields.length > 0) {
      await query(
        `UPDATE entities SET ${setFields.join(', ')} WHERE id = $${idx}`,
        values
      );
    }
  }

  if (Object.keys(providerData).length > 0) {
    const setFields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const add = (field: string, value: unknown) => {
      if (value !== undefined) {
        setFields.push(`${field} = $${idx++}`);
        values.push(value);
      }
    };

    add('provider_type', providerData.provider_type);
    add('contact_name', providerData.contact_name);
    add('email', providerData.email);
    add('phone', providerData.phone);
    add('instagram', providerData.instagram);
    add('website', providerData.website);
    add('public_description', providerData.public_description);
    values.push(entityId);

    if (setFields.length > 0) {
      await query(
        `UPDATE providers SET ${setFields.join(', ')} WHERE entity_id = $${idx}`,
        values
      );
    }
  }
}

export async function deleteProvider(entityId: string): Promise<void> {
  if (!isPersistenceConfigured()) {
    await db.deleteEntity(entityId);
    return;
  }

  await query(
    "UPDATE entities SET active = false, status = 'archived', updated_at = NOW() WHERE id = $1",
    [entityId]
  );
}
