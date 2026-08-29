'use server';

import { isPersistenceConfigured, getPublicConfig } from '@/infrastructure/config/env';
import { query } from '@/infrastructure/database/pool';
import { requireDashboardAdmin } from '@/infrastructure/auth/dashboardGuard';
import { createStellarGateway } from '@/infrastructure/stellar/createStellarGateway';
import { computeEntityMetadataHash } from '@/lib/entityMetadata';
import { domainError } from '@/domain/errors';
import type { OperationState } from '@/ports/StellarGateway';
import type { PreparedTransactionPayload } from '@/ports/SignerPort';

export interface PrepareEntityResult {
  operation: OperationState;
  prepared: PreparedTransactionPayload;
  walletAddress: string;
  environment: 'demo' | 'testnet' | 'mainnet';
}

interface CommonEntityFields {
  id: string;
  display_name: string;
  slug: string;
  country: string;
  city: string;
  status: string;
  is_public: boolean;
  kind: string;
}

async function fetchEntityWithKind(entityId: string): Promise<CommonEntityFields & { kind: 'person' | 'organization' | 'provider' | 'event' }> {
  const result = await query<CommonEntityFields>(
    `SELECT id, display_name, slug, country, city, status, is_public, kind
     FROM entities
     WHERE id = $1 AND active = true`,
    [entityId]
  );

  if (!result.rows[0]) {
    throw domainError('NOT_FOUND', `Entidad ${entityId} no encontrada`);
  }

  const row = result.rows[0];
  const kind = row.kind;
  if (kind !== 'person' && kind !== 'organization' && kind !== 'provider' && kind !== 'event') {
    throw domainError('INVALID_INPUT', `Tipo de entidad no soportado para registro Stellar: ${kind}`);
  }

  return { ...row, kind };
}

async function buildPayload(entityId: string, kind: 'person' | 'organization' | 'provider' | 'event'): Promise<Record<string, unknown>> {
  const common = await fetchEntityWithKind(entityId);

  const payload: Record<string, unknown> = {
    display_name: common.display_name,
    slug: common.slug,
    country: common.country,
    city: common.city,
    status: common.status,
    is_public: common.is_public,
    kind: common.kind,
  };

  if (kind === 'person') {
    const result = await query<{
      legal_name: string | null;
      artistic_name: string;
      email: string | null;
      phone: string | null;
      instagram: string | null;
      bio: string | null;
      photo_url: string | null;
      main_role: string;
    }>('SELECT legal_name, artistic_name, email, phone, instagram, bio, photo_url, main_role FROM people WHERE entity_id = $1', [entityId]);
    if (!result.rows[0]) {
      throw domainError('NOT_FOUND', `Persona ${entityId} no encontrada`);
    }
    const p = result.rows[0];
    Object.assign(payload, {
      legal_name: p.legal_name,
      artistic_name: p.artistic_name,
      email: p.email,
      phone: p.phone,
      instagram: p.instagram,
      bio: p.bio,
      photo_url: p.photo_url,
      main_role: p.main_role,
    });
  } else if (kind === 'organization') {
    const result = await query<{
      organization_type: string;
      website: string | null;
      instagram: string | null;
      contact_name: string | null;
      contact_email: string | null;
      contact_phone: string | null;
    }>(
      'SELECT organization_type, website, instagram, contact_name, contact_email, contact_phone FROM organizations WHERE entity_id = $1',
      [entityId]
    );
    if (!result.rows[0]) {
      throw domainError('NOT_FOUND', `Organización ${entityId} no encontrada`);
    }
    const o = result.rows[0];
    Object.assign(payload, {
      organization_type: o.organization_type,
      website: o.website,
      instagram: o.instagram,
      contact_name: o.contact_name,
      contact_email: o.contact_email,
      contact_phone: o.contact_phone,
    });
  } else if (kind === 'provider') {
    const result = await query<{
      provider_type: string;
      contact_name: string | null;
      email: string | null;
      phone: string | null;
      instagram: string | null;
      website: string | null;
      public_description: string | null;
    }>(
      'SELECT provider_type, contact_name, email, phone, instagram, website, public_description FROM providers WHERE entity_id = $1',
      [entityId]
    );
    if (!result.rows[0]) {
      throw domainError('NOT_FOUND', `Proveedor ${entityId} no encontrada`);
    }
    const p = result.rows[0];
    Object.assign(payload, {
      provider_type: p.provider_type,
      contact_name: p.contact_name,
      email: p.email,
      phone: p.phone,
      instagram: p.instagram,
      website: p.website,
      public_description: p.public_description,
    });
  } else if (kind === 'event') {
    const result = await query<{
      name: string;
      slug: string;
      year: number;
      start_date: string;
      end_date: string | null;
      location: string | null;
      address: string | null;
      description: string | null;
      organizer_entity_id: string | null;
    }>(
      'SELECT name, slug, year, start_date, end_date, location, address, description, organizer_entity_id FROM events WHERE entity_id = $1',
      [entityId]
    );
    if (!result.rows[0]) {
      throw domainError('NOT_FOUND', `Evento ${entityId} no encontrado`);
    }
    const e = result.rows[0];
    Object.assign(payload, {
      event_name: e.name,
      event_slug: e.slug,
      year: e.year,
      start_date: e.start_date,
      end_date: e.end_date,
      location: e.location,
      address: e.address,
      description: e.description,
      organizer_entity_id: e.organizer_entity_id,
    });
  }

  return payload;
}

/**
 * Prepara el registro de cualquier entidad activa (persona, organización,
 * proveedor o evento) en el contrato Stellar. El cliente firma y envía el
 * payload con signAndSubmitOperation.
 */
export async function prepareEntityForStellar(entityId: string): Promise<PrepareEntityResult> {
  if (!isPersistenceConfigured()) {
    throw domainError('INTERNAL', 'Se requiere DATABASE_URL para registrar entidades en Stellar');
  }

  const actor = await requireDashboardAdmin();

  if (!actor.walletAddress) {
    throw domainError('UNAUTHORIZED', 'El actor no tiene una wallet on-chain configurada');
  }

  const { kind } = await fetchEntityWithKind(entityId);
  const payload = await buildPayload(entityId, kind);
  const metadataHash = await computeEntityMetadataHash(payload);

  const { gateway } = createStellarGateway();
  const operation = await gateway.prepareRegisterEntity({
    idempotencyKey: `register:${entityId}`,
    actorAddress: actor.walletAddress,
    entityId,
    metadataHash,
    hashSchema: 1,
  });

  const prepared = await gateway.getPreparedPayload(operation.operationId);

  return {
    operation,
    prepared,
    walletAddress: actor.walletAddress,
    environment: getPublicConfig().environment,
  };
}
