import { createHash, randomBytes } from 'node:crypto';
import { canonicalizeJson, buildDigestInput } from '../../infrastructure/hashing/canonicalize';
import { domainError } from '../errors';

export type CredentialFamily = 'participant' | 'guest' | 'staff';
export type ParticipationMode = 'solo' | 'group' | 'not_applicable';
export type EvidenceSourceType = 'participation' | 'relationship';
export type CredentialStatus = 'draft' | 'issued' | 'revoked';

export interface CanonicalIssuer {
  id: string;
  display_name: string;
  kind: string;
  slug?: string;
}

export interface CanonicalSubject {
  id: string;
  display_name: string;
  kind: string;
  artistic_name?: string | null;
  slug?: string;
}

export interface CanonicalEvent {
  id: string;
  name: string;
  year?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
}

export interface CanonicalEvidenceItem {
  source_type: EvidenceSourceType;
  source_id: string;
  evidence_role: string;
}

export interface CanonicalClaim {
  display_label: string;
  display_subtitle: string;
  presentation_code?: string | null;
  organization_name?: string | null;
  roles: string[];
  evidences: CanonicalEvidenceItem[];
}

export interface CanonicalPayloadV2 {
  schema_version: 'culturago.credential.v2';
  public_id: string;
  credential_family: CredentialFamily;
  participation_mode: ParticipationMode;
  issuer: CanonicalIssuer;
  subject: CanonicalSubject;
  event: CanonicalEvent;
  claim: CanonicalClaim;
  issued_at: string;
}

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
  canonicalPayload?: CanonicalPayloadV2 | Record<string, unknown>;
  payloadDigest?: string;
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
 * Generates an unpredictable, URL-safe public_id separate from internal UUIDs.
 * Format: "cg2_" + 16 random URL-safe characters.
 */
export function generatePublicIdV2(): string {
  const token = randomBytes(12).toString('base64url');
  return `cg2_${token}`;
}

/**
 * Builds a deterministic CanonicalPayloadV2 with sorted arrays and normalized claims.
 * Strips any sensitive PII (emails, private legal names) and mutable timestamps.
 */
export function buildCanonicalPayloadV2(params: {
  publicId: string;
  credentialFamily: CredentialFamily;
  participationMode: ParticipationMode;
  issuer: CanonicalIssuer;
  subject: CanonicalSubject;
  event: CanonicalEvent;
  displayLabel: string;
  displaySubtitle: string;
  presentationCode?: string | null;
  organizationName?: string | null;
  roles: string[];
  evidences: CanonicalEvidenceItem[];
  issuedAt: string;
}): CanonicalPayloadV2 {
  // Sort roles alphabetically
  const sortedRoles = [...new Set(params.roles)].sort();

  // Sort evidences deterministically by (source_type, source_id, evidence_role)
  const sortedEvidences = [...params.evidences].sort((a, b) => {
    const c1 = a.source_type.localeCompare(b.source_type);
    if (c1 !== 0) return c1;
    const c2 = a.source_id.localeCompare(b.source_id);
    if (c2 !== 0) return c2;
    return a.evidence_role.localeCompare(b.evidence_role);
  });

  const payload: CanonicalPayloadV2 = {
    schema_version: 'culturago.credential.v2',
    public_id: params.publicId,
    credential_family: params.credentialFamily,
    participation_mode: params.participationMode,
    issuer: {
      id: params.issuer.id,
      display_name: params.issuer.display_name,
      kind: params.issuer.kind,
      ...(params.issuer.slug ? { slug: params.issuer.slug } : {}),
    },
    subject: {
      id: params.subject.id,
      display_name: params.subject.display_name,
      kind: params.subject.kind,
      ...(params.subject.artistic_name ? { artistic_name: params.subject.artistic_name } : {}),
      ...(params.subject.slug ? { slug: params.subject.slug } : {}),
    },
    event: {
      id: params.event.id,
      name: params.event.name,
      ...(params.event.year != null ? { year: params.event.year } : {}),
      ...(params.event.start_date ? { start_date: params.event.start_date } : {}),
      ...(params.event.end_date ? { end_date: params.event.end_date } : {}),
      ...(params.event.location ? { location: params.event.location } : {}),
    },
    claim: {
      display_label: params.displayLabel,
      display_subtitle: params.displaySubtitle,
      ...(params.presentationCode ? { presentation_code: params.presentationCode } : {}),
      ...(params.organizationName ? { organization_name: params.organizationName } : {}),
      roles: sortedRoles,
      evidences: sortedEvidences,
    },
    issued_at: params.issuedAt,
  };

  return payload;
}

/**
 * Computes deterministic RFC 8785 (JCS) canonical JSON representation.
 */
export function canonicalizePayloadV2(payload: CanonicalPayloadV2): string {
  return canonicalizeJson(payload);
}

/**
 * Computes SHA-256 payload_digest with domain separator:
 * SHA-256("CULTURAGO\0culturago.credential.v2\0" || canonicalJsonUtf8Bytes)
 */
export function computePayloadDigestV2(payload: CanonicalPayloadV2): string {
  const canonicalJson = canonicalizePayloadV2(payload);
  const digestInput = buildDigestInput('culturago.credential.v2', canonicalJson);
  return createHash('sha256').update(digestInput).digest('hex');
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

  // If full canonicalPayload is provided, verify envelope consistency & digest integrity
  if (input.canonicalPayload && (input.canonicalPayload as any).public_id) {
    const payload = input.canonicalPayload as CanonicalPayloadV2;
    if (payload.public_id !== input.publicId) {
      throw domainError('INVALID_CREDENTIAL', 'public_id in canonicalPayload does not match input.publicId');
    }
    if (payload.credential_family !== input.credentialFamily) {
      throw domainError('INVALID_CREDENTIAL', 'credential_family in canonicalPayload does not match input.credentialFamily');
    }
    if (payload.participation_mode !== input.participationMode) {
      throw domainError('INVALID_CREDENTIAL', 'participation_mode in canonicalPayload does not match input.participationMode');
    }
    if (input.issuedAt && payload.issued_at !== input.issuedAt) {
      throw domainError('INVALID_CREDENTIAL', 'issued_at in canonicalPayload does not match input.issuedAt');
    }

    // Verify digest integrity if digest is provided
    if (input.payloadDigest) {
      const recomputedDigest = computePayloadDigestV2(payload);
      if (recomputedDigest !== input.payloadDigest) {
        throw domainError('INVALID_CREDENTIAL', `payloadDigest mismatch: expected '${input.payloadDigest}', computed '${recomputedDigest}'`);
      }
    }
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
