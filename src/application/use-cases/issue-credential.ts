import { DatabaseGateway } from '../../ports/DatabaseGateway';
import { domainError } from '../../domain/errors';
import {
  buildCredential,
  CredentialRecord,
  credentialBusinessKey,
} from '../../domain/credentials/credential';
import { credentialTypeCode } from '../../domain/credentials/catalog';
import { assertParticipationConfirmed } from './manage-participation';

export interface IssueCredentialDeps {
  db: DatabaseGateway;
  newId: () => string;
  /** Server clock; the browser never supplies timestamps. */
  now: () => string;
}

export interface IssueCredentialCommand {
  issuerId: string;
  operatorId: string;
  subjectId: string;
  eventId: string;
  credentialType: string;
  credentialCode: string;
  metadataHash: string;
  hashSchema: number;
}

export async function issueCredential(
  deps: IssueCredentialDeps,
  command: IssueCredentialCommand
): Promise<CredentialRecord> {
  const type = credentialTypeCode(command.credentialType);

  const link = await deps.db.getIssuerOperatorLink(command.issuerId, command.operatorId);
  if (!link || !link.active) {
    throw domainError(
      'ISSUER_OPERATOR_NOT_LINKED',
      'Operator is not linked to this issuer; a global role alone cannot act for an organization'
    );
  }

  await assertParticipationConfirmed(deps, command.subjectId, command.eventId);

  const existing = await deps.db.findCredentialByBusinessKey(
    command.issuerId,
    command.subjectId,
    command.eventId,
    type
  );

  const record = buildCredential(existing, {
    credentialId: deps.newId(),
    credentialCode: command.credentialCode,
    issuerId: command.issuerId,
    issuedBy: command.operatorId,
    subjectId: command.subjectId,
    eventId: command.eventId,
    credentialType: command.credentialType,
    metadataHash: command.metadataHash,
    hashSchema: command.hashSchema,
    issuedIntentAt: deps.now(),
  });

  if (record === existing) return existing!;

  await deps.db.saveCredential(record);
  return record;
}

export { credentialBusinessKey };
