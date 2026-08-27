'use server';

import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { query } from '@/infrastructure/database/pool';
import { db, Entity, Person, StellarStatus, WalletStatus } from '@/lib/db';

interface PersonFormEntityData {
  display_name: string;
  slug: string;
  country: string;
  city: string;
  status: 'draft' | 'pending' | 'verified';
  is_public: boolean;
}

interface PersonFormPersonData {
  legal_name: string | null;
  artistic_name: string;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  bio: string | null;
  photo_url: string | null;
  main_role: Person['main_role'];
}

interface RawPersonRow {
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
  legal_name: string | null;
  artistic_name: string;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  bio: string | null;
  photo_url: string | null;
  main_role: Person['main_role'];
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

function mapRowToPerson(row: RawPersonRow): Person & { entity: Entity } {
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at;

  const entity: Entity = {
    id: row.id,
    type: 'person',
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
    created_at: entity.created_at,
    updated_at: entity.updated_at,
  };

  return { ...person, entity };
}

/**
 * Lists people from the real PostgreSQL persistence when configured,
 * otherwise falls back to the in-memory demo mock.
 */
export async function listPeople(): Promise<(Person & { entity: Entity })[]> {
  if (!isPersistenceConfigured()) {
    return db.getPeople();
  }

  const result = await query<RawPersonRow>(`
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
      WHERE subject_key = culturago_canonical_hash('culturago.entity.v1', e.id::text)
        AND operation_type = 'register_entity'
      ORDER BY
        CASE phase WHEN 'confirmed' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    ) so ON true
    WHERE e.kind = 'person' AND e.active = true
    ORDER BY e.display_name
  `);

  return result.rows.map(mapRowToPerson);
}

/**
 * Creates a new person entity in PostgreSQL, or in the demo mock when no DB
 * is configured.
 */
export async function createPerson(
  entityData: PersonFormEntityData,
  personData: PersonFormPersonData
): Promise<void> {
  if (!isPersistenceConfigured()) {
    await db.createPerson(entityData as any, personData as any);
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await query(
    `INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active, latest_version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      'person',
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
    `INSERT INTO people (entity_id, legal_name, artistic_name, email, phone, instagram, bio, photo_url, main_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      personData.legal_name,
      personData.artistic_name,
      personData.email,
      personData.phone,
      personData.instagram,
      personData.bio,
      personData.photo_url,
      personData.main_role,
    ]
  );
}

/**
 * Updates a person and its entity in PostgreSQL, or in the demo mock.
 */
export async function updatePerson(
  entityId: string,
  entityData: Partial<PersonFormEntityData>,
  personData: Partial<PersonFormPersonData>
): Promise<void> {
  if (!isPersistenceConfigured()) {
    await db.updatePerson(entityId, entityData as any, personData as any);
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

  if (Object.keys(personData).length > 0) {
    const setFields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const add = (field: string, value: unknown) => {
      if (value !== undefined) {
        setFields.push(`${field} = $${idx++}`);
        values.push(value);
      }
    };

    add('legal_name', personData.legal_name);
    add('artistic_name', personData.artistic_name);
    add('email', personData.email);
    add('phone', personData.phone);
    add('instagram', personData.instagram);
    add('bio', personData.bio);
    add('photo_url', personData.photo_url);
    add('main_role', personData.main_role);
    values.push(entityId);

    if (setFields.length > 0) {
      await query(
        `UPDATE people SET ${setFields.join(', ')} WHERE entity_id = $${idx}`,
        values
      );
    }
  }
}

/**
 * Soft-deletes a person by deactivating its entity. Falls back to the demo
 * mock when no DB is configured.
 */
export async function deletePerson(entityId: string): Promise<void> {
  if (!isPersistenceConfigured()) {
    await db.deleteEntity(entityId);
    return;
  }

  await query(
    "UPDATE entities SET active = false, status = 'archived', updated_at = NOW() WHERE id = $1",
    [entityId]
  );
}
