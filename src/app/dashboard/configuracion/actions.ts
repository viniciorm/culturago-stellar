'use server';

import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { query } from '@/infrastructure/database/pool';
import { domainError } from '@/domain/errors';
import {
  type Entity,
  type Relationship,
  type PopulatedRelationship,
} from '@/domain/types/entities';

interface RelationshipRow {
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
  from_kind: Entity['type'];
  to_display_name: string;
  to_kind: Entity['type'];
}

function toDateString(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapRowToPopulatedRelationship(row: RelationshipRow): PopulatedRelationship {
  const createdAt = toDateString(row.created_at) ?? new Date().toISOString();
  const updatedAt = toDateString(row.updated_at) ?? createdAt;

  const fromEntity: Entity = {
    id: row.from_entity_id,
    type: row.from_kind,
    display_name: row.from_display_name,
    slug: '',
    country: 'Chile',
    city: 'Santiago',
    status: 'verified',
    stellar_status: 'not_registered',
    wallet_status: 'none',
    is_public: true,
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
    stellar_status: 'not_registered',
    wallet_status: 'none',
    is_public: true,
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
    start_date: row.start_date,
    end_date: row.end_date,
    notes: row.notes,
    created_at: createdAt,
    updated_at: updatedAt,
  };

  return {
    ...relationship,
    fromEntity,
    toEntity,
  };
}

export async function listRelationships(): Promise<PopulatedRelationship[]> {
  if (!isPersistenceConfigured()) {
    return [];
  }

  const result = await query<RelationshipRow>(`
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

  return result.rows.map(mapRowToPopulatedRelationship);
}

export async function createRelationship(
  input: Omit<Relationship, 'id' | 'created_at' | 'updated_at'>
): Promise<Relationship> {
  if (!isPersistenceConfigured()) {
    throw domainError('INTERNAL', 'Se requiere DATABASE_URL para crear relaciones');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await query(
    `INSERT INTO relationships (
      id, from_entity_id, to_entity_id, relationship_type, context_event_id,
      status, start_date, end_date, notes, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      input.from_entity_id,
      input.to_entity_id,
      input.relationship_type,
      input.context_event_id ?? null,
      input.status ?? 'active',
      input.start_date ?? null,
      input.end_date ?? null,
      input.notes ?? null,
      now,
      now,
    ]
  );

  return { ...input, id, created_at: now, updated_at: now };
}

export async function deleteRelationship(id: string): Promise<void> {
  if (!isPersistenceConfigured()) {
    throw domainError('INTERNAL', 'Se requiere DATABASE_URL para eliminar relaciones');
  }

  await query(
    `UPDATE relationships SET status = 'archived', updated_at = NOW() WHERE id = $1`,
    [id]
  );
}
