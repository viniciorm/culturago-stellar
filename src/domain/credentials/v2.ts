import { domainError } from '../errors';

export type CredentialFamily = 'participant' | 'guest' | 'staff';
export type ParticipationMode = 'solo' | 'group' | 'not_applicable';
export type EvidenceSourceType = 'participation' | 'relationship';

export interface CredentialV2DomainInput {
  publicId: string;
  issuerEntityId: string;
  subjectEntityId: string;
  eventEntityId: string;
  credentialFamily: CredentialFamily;
  participationMode: ParticipationMode;
  participationId?: string | null;
  schemaVersion: 'culturago.credential.v2';
  displayLabel: string;
  displaySubtitle: string;
  canonicalPayload: Record<string, unknown>;
  payloadDigest: string;
  issuedAt?: string | null;
}

export interface EvidenceInput {
  credentialId: string;
  sourceType: EvidenceSourceType;
  sourceId: string;
  evidenceRole: string;
  notes?: string | null;
}

export interface EvidenceValidationContext {
  participationExists: (id: string) => Promise<boolean> | boolean;
  relationshipExists: (id: string) => Promise<boolean> | boolean;
}

/**
 * Validates domain coherence for Credential V2 inputs before persistence.
 */
export function validateCredentialV2Input(input: CredentialV2DomainInput): void {
  if (input.schemaVersion !== 'culturago.credential.v2') {
    throw domainError('INVALID_CREDENTIAL', `schemaVersion must be 'culturago.credential.v2', got '${input.schemaVersion}'`);
  }

  if (input.credentialFamily === 'participant' || input.credentialFamily === 'guest') {
    if (input.participationMode !== 'solo' && input.participationMode !== 'group') {
      throw domainError(
        'INVALID_CREDENTIAL',
        `Credential family '${input.credentialFamily}' requires participationMode 'solo' or 'group', got '${input.participationMode}'`
      );
    }
    if (!input.participationId) {
      throw domainError(
        'INVALID_CREDENTIAL',
        `Credential family '${input.credentialFamily}' requires a non-null participationId`
      );
    }
  } else if (input.credentialFamily === 'staff') {
    if (input.participationMode !== 'not_applicable') {
      throw domainError(
        'INVALID_CREDENTIAL',
        `Credential family 'staff' requires participationMode 'not_applicable', got '${input.participationMode}'`
      );
    }
    if (input.participationId != null) {
      throw domainError(
        'INVALID_CREDENTIAL',
        `Credential family 'staff' must have participationId as null`
      );
    }
  } else {
    throw domainError('INVALID_CREDENTIAL', `Unknown credential family '${input.credentialFamily}'`);
  }

  if (input.payloadDigest && !/^[0-9a-f]{64}$/.test(input.payloadDigest)) {
    throw domainError('INVALID_CREDENTIAL', 'payloadDigest must be a 64-character lowercase hexadecimal string');
  }
}

/**
 * Validates polymorphic evidence before inserting into credential_evidence.
 * Checks that source_id actually exists in its target table.
 */
export async function validateEvidenceInput(
  input: EvidenceInput,
  context: EvidenceValidationContext
): Promise<void> {
  if (input.sourceType === 'participation') {
    const exists = await context.participationExists(input.sourceId);
    if (!exists) {
      throw domainError(
        'INVALID_EVIDENCE',
        `Evidence source_id '${input.sourceId}' does not exist in participations`
      );
    }
  } else if (input.sourceType === 'relationship') {
    const exists = await context.relationshipExists(input.sourceId);
    if (!exists) {
      throw domainError(
        'INVALID_EVIDENCE',
        `Evidence source_id '${input.sourceId}' does not exist in relationships`
      );
    }
  } else {
    throw domainError('INVALID_EVIDENCE', `Unknown evidence source_type '${input.sourceType}'`);
  }
}
