import { CredentialRecord } from '../domain/credentials/credential';
import { EntityRecord } from '../domain/entities/entity';
import { ParticipationRecord } from '../domain/participation/participation';
import { DomainEntityKind, RelationshipType } from '../domain/participation/relationships';

export interface IssuerOperatorLink {
  issuerId: string;
  operatorId: string;
  active: boolean;
}

export interface EntityKindRef {
  entityId: string;
  kind: DomainEntityKind;
}

/** Required when saving an entity that does not exist yet. */
export interface NewEntityDetails {
  kind: DomainEntityKind;
  displayName: string;
  slug: string;
  country: string;
  city: string;
}

/**
 * Persistence port. Every adapter (PostgreSQL, in-memory) must apply the same
 * uniqueness constraints, transition rules and typed domain errors.
 */
export interface DatabaseGateway {
  getEntityRecord(entityId: string): Promise<EntityRecord | null>;
  saveEntityRecord(record: EntityRecord, details?: NewEntityDetails): Promise<void>;

  getEntityKind(entityId: string): Promise<DomainEntityKind | null>;

  getParticipation(subjectId: string, eventId: string): Promise<ParticipationRecord | null>;
  saveParticipation(record: ParticipationRecord): Promise<void>;

  getIssuerOperatorLink(issuerId: string, operatorId: string): Promise<IssuerOperatorLink | null>;

  findCredentialByBusinessKey(
    issuerId: string,
    subjectId: string,
    eventId: string,
    credentialType: number
  ): Promise<CredentialRecord | null>;
  getCredentialById(credentialId: string): Promise<CredentialRecord | null>;
  saveCredential(record: CredentialRecord): Promise<void>;
  listCredentialsBySubject(subjectId: string): Promise<CredentialRecord[]>;

  listRelationshipEdges(
    types: readonly RelationshipType[]
  ): Promise<readonly (readonly [string, string])[]>;
}
