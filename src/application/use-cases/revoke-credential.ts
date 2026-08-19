import { DatabaseGateway } from '../../ports/DatabaseGateway';
import { domainError } from '../../domain/errors';
import {
  CredentialRecord,
  revokeCredential as revokeRecord,
  verifyCredentialPayload,
} from '../../domain/credentials/credential';

export interface RevokeCredentialDeps {
  db: DatabaseGateway;
  now: () => string;
}

export async function revokeCredential(
  deps: RevokeCredentialDeps,
  input: { credentialId: string; operatorId: string; reasonHash: string | null }
): Promise<CredentialRecord> {
  const record = await deps.db.getCredentialById(input.credentialId);
  if (!record) {
    throw domainError('NOT_FOUND', `Credential ${input.credentialId} not found`);
  }

  const link = await deps.db.getIssuerOperatorLink(record.issuerId, input.operatorId);
  if (!link || !link.active) {
    throw domainError(
      'ISSUER_OPERATOR_NOT_LINKED',
      'Only an operator linked to the issuing organization can revoke'
    );
  }

  const updated = revokeRecord(record, {
    operatorId: input.operatorId,
    reasonHash: input.reasonHash,
    revokedAt: deps.now(),
  });

  if (updated !== record) {
    await deps.db.saveCredential(updated);
  }
  return updated;
}

export async function verifyCredential(
  deps: { db: DatabaseGateway },
  input: { credentialId: string; metadataHash: string; hashSchema: number }
) {
  const record = await deps.db.getCredentialById(input.credentialId);
  return verifyCredentialPayload(record, input.metadataHash, input.hashSchema);
}
