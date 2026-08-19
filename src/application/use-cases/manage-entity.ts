import { DatabaseGateway, NewEntityDetails } from '../../ports/DatabaseGateway';
import { domainError } from '../../domain/errors';
import {
  deactivateEntity,
  EntityRecord,
  registerEntity,
  versionEntity,
} from '../../domain/entities/entity';

export interface ManageEntityDeps {
  db: DatabaseGateway;
  now: () => string;
}

export async function registerEntityRecord(
  deps: ManageEntityDeps,
  input: {
    entityId: string;
    metadataHash: string;
    hashSchema: number;
    registrarId: string;
    details?: NewEntityDetails;
  }
): Promise<EntityRecord> {
  const existing = await deps.db.getEntityRecord(input.entityId);
  const record = registerEntity(existing, input.entityId, {
    metadataHash: input.metadataHash,
    hashSchema: input.hashSchema,
    registrarId: input.registrarId,
    recordedAt: deps.now(),
  });
  if (record !== existing) {
    await deps.db.saveEntityRecord(record, input.details);
  }
  return record;
}

export async function versionEntityRecord(
  deps: ManageEntityDeps,
  input: {
    entityId: string;
    expectedVersion: number;
    metadataHash: string;
    hashSchema: number;
    registrarId: string;
  }
): Promise<EntityRecord> {
  const existing = await deps.db.getEntityRecord(input.entityId);
  if (!existing) {
    throw domainError('NOT_FOUND', `Entity ${input.entityId} not found`);
  }
  const record = versionEntity(existing, input.expectedVersion, {
    metadataHash: input.metadataHash,
    hashSchema: input.hashSchema,
    registrarId: input.registrarId,
    recordedAt: deps.now(),
  });
  await deps.db.saveEntityRecord(record);
  return record;
}

export async function deactivateEntityRecord(
  deps: ManageEntityDeps,
  input: { entityId: string; expectedVersion: number }
): Promise<EntityRecord> {
  const existing = await deps.db.getEntityRecord(input.entityId);
  if (!existing) {
    throw domainError('NOT_FOUND', `Entity ${input.entityId} not found`);
  }
  const record = deactivateEntity(existing, input.expectedVersion);
  if (record !== existing) {
    await deps.db.saveEntityRecord(record);
  }
  return record;
}
