import {
  DatabaseGateway,
  EntityKindRef,
  IssuerOperatorLink,
} from '@/ports/DatabaseGateway';
import { CredentialRecord, credentialBusinessKey } from '@/domain/credentials/credential';
import { EntityRecord } from '@/domain/entities/entity';
import { ParticipationRecord } from '@/domain/participation/participation';
import { DomainEntityKind, RelationshipType } from '@/domain/participation/relationships';
import { domainError } from '@/domain/errors';

/**
 * Test double for DatabaseGateway. Applies the same uniqueness and
 * transition constraints expected from the Supabase adapter so use cases
 * can be tested without infrastructure.
 */
export class InMemoryDatabaseGateway implements DatabaseGateway {
  entities = new Map<string, EntityRecord>();
  kinds = new Map<string, DomainEntityKind>();
  participations = new Map<string, ParticipationRecord>();
  links = new Map<string, IssuerOperatorLink>();
  credentials = new Map<string, CredentialRecord>();
  relationshipEdges: { type: RelationshipType; from: string; to: string }[] = [];

  private participationKey(subjectId: string, eventId: string): string {
    return `${subjectId}|${eventId}`;
  }

  async getEntityRecord(entityId: string): Promise<EntityRecord | null> {
    return this.entities.get(entityId) ?? null;
  }

  async saveEntityRecord(record: EntityRecord): Promise<void> {
    const existing = this.entities.get(record.entityId);
    if (existing && existing.versions.length > record.versions.length) {
      throw domainError('INVALID_INPUT', 'Entity history cannot shrink');
    }
    this.entities.set(record.entityId, record);
  }

  async getEntityKind(entityId: string): Promise<DomainEntityKind | null> {
    return this.kinds.get(entityId) ?? null;
  }

  async getParticipation(subjectId: string, eventId: string): Promise<ParticipationRecord | null> {
    return this.participations.get(this.participationKey(subjectId, eventId)) ?? null;
  }

  async saveParticipation(record: ParticipationRecord): Promise<void> {
    this.participations.set(this.participationKey(record.subjectId, record.eventId), record);
  }

  async getIssuerOperatorLink(
    issuerId: string,
    operatorId: string
  ): Promise<IssuerOperatorLink | null> {
    return this.links.get(`${issuerId}|${operatorId}`) ?? null;
  }

  async findCredentialByBusinessKey(
    issuerId: string,
    subjectId: string,
    eventId: string,
    credentialType: number
  ): Promise<CredentialRecord | null> {
    const key = credentialBusinessKey({ issuerId, subjectId, eventId, credentialType });
    for (const record of this.credentials.values()) {
      if (
        credentialBusinessKey({
          issuerId: record.issuerId,
          subjectId: record.subjectId,
          eventId: record.eventId,
          credentialType: record.credentialType,
        }) === key
      ) {
        return record;
      }
    }
    return null;
  }

  async getCredentialById(credentialId: string): Promise<CredentialRecord | null> {
    return this.credentials.get(credentialId) ?? null;
  }

  async saveCredential(record: CredentialRecord): Promise<void> {
    const key = credentialBusinessKey({
      issuerId: record.issuerId,
      subjectId: record.subjectId,
      eventId: record.eventId,
      credentialType: record.credentialType,
    });
    for (const [id, existing] of this.credentials) {
      if (
        id !== record.credentialId &&
        credentialBusinessKey({
          issuerId: existing.issuerId,
          subjectId: existing.subjectId,
          eventId: existing.eventId,
          credentialType: existing.credentialType,
        }) === key
      ) {
        throw domainError('ALREADY_EXISTS', 'Duplicate credential business key');
      }
    }
    this.credentials.set(record.credentialId, record);
  }

  async listCredentialsBySubject(subjectId: string): Promise<CredentialRecord[]> {
    return [...this.credentials.values()].filter((c) => c.subjectId === subjectId);
  }

  async listRelationshipEdges(
    types: readonly RelationshipType[]
  ): Promise<readonly (readonly [string, string])[]> {
    return this.relationshipEdges
      .filter((e) => types.includes(e.type))
      .map((e) => [e.from, e.to] as const);
  }

  addKind(ref: EntityKindRef): void {
    this.kinds.set(ref.entityId, ref.kind);
  }

  addLink(link: IssuerOperatorLink): void {
    this.links.set(`${link.issuerId}|${link.operatorId}`, link);
  }
}
