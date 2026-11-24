import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { canonicalizeJson, buildDigestInput } from '../../infrastructure/hashing/canonicalize';
import { domainError } from '../errors';

export type CredentialFamily = 'participant' | 'guest' | 'staff';
export type ParticipationMode = 'solo' | 'group' | 'not_applicable';
export type EvidenceSourceType = 'participation' | 'relationship';
export type CredentialStatus = 'draft' | 'issued' | 'revoked';
export type V2ContractFamilyCode = 101 | 102 | 103;

export const V2_CONTRACT_HASH_SCHEMA = 2 as const;
export const ZERO_BYTES32_HEX = '0'.repeat(64);

const FAMILY_TO_CONTRACT_CODE: Record<CredentialFamily, V2ContractFamilyCode> = {
  participant: 101,
  guest: 102,
  staff: 103,
};

const CONTRACT_CODE_TO_FAMILY: Record<V2ContractFamilyCode, CredentialFamily> = {
  101: 'participant',
  102: 'guest',
  103: 'staff',
};

function sha256HexParts(parts: (string | Buffer)[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(typeof part === 'string' ? Buffer.from(part, 'utf8') : part);
  }
  return hash.digest('hex');
}

function u32BeBuffer(val: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(val, 0);
  return buf;
}

export function credentialFamilyToContractCode(
  family: CredentialFamily
): V2ContractFamilyCode {
  const code = FAMILY_TO_CONTRACT_CODE[family];
  if (!code) {
    throw domainError('INVALID_CREDENTIAL', `Unsupported V2 credential family '${family}'`);
  }
  return code;
}

export function contractCodeToCredentialFamily(
  code: number
): CredentialFamily {
  const family = CONTRACT_CODE_TO_FAMILY[code as V2ContractFamilyCode];
  if (!family) {
    throw domainError('INVALID_CREDENTIAL', `Unsupported V2 contract family code '${code}'`);
  }
  return family;
}

export function computeV2CredentialIdHex(publicId: string): string {
  if (!publicId || typeof publicId !== 'string') {
    throw domainError('INVALID_CREDENTIAL', 'publicId is required to derive V2 credential_id');
  }
  return sha256HexParts([`culturago.credential.v2.id\0${publicId}`]);
}

export function computeV2EntityIdHex(entityId: string): string {
  if (!entityId || typeof entityId !== 'string') {
    throw domainError('INVALID_CREDENTIAL', 'entityId is required to derive V2 entity hash');
  }
  return sha256HexParts([`culturago.entity.v1\0${entityId}`]);
}

export function computeV2ScopeIdHex(
  familyOrCode: CredentialFamily | V2ContractFamilyCode,
  participationId?: string | null
): string {
  const family =
    typeof familyOrCode === 'number'
      ? contractCodeToCredentialFamily(familyOrCode)
      : familyOrCode;

  if (family === 'staff') {
    if (participationId != null) {
      throw domainError(
        'INVALID_CREDENTIAL',
        `Family 'staff' requires null participationId (zero scope)`
      );
    }
    return ZERO_BYTES32_HEX;
  }

  if (!participationId) {
    throw domainError(
      'INVALID_CREDENTIAL',
      `Family '${family}' requires participationId for V2 scope`
    );
  }
  return sha256HexParts([`culturago.participation.v2\0${participationId}`]);
}

export function computeV2BusinessKeyHex(params: {
  subjectIdHex: string;
  eventIdHex: string;
  familyCode: V2ContractFamilyCode;
  scopeIdHex: string;
}): string {
  return sha256HexParts([
    'culturago.registry.v2\0',
    Buffer.from(params.subjectIdHex, 'hex'),
    Buffer.from(params.eventIdHex, 'hex'),
    u32BeBuffer(params.familyCode),
    Buffer.from(params.scopeIdHex, 'hex'),
  ]);
}

export interface V2OnChainIdentifiers {
  familyCode: V2ContractFamilyCode;
  hashSchema: 2;
  credentialIdHex: string;
  issuerIdHex: string;
  subjectIdHex: string;
  eventIdHex: string;
  scopeIdHex: string;
  businessKeyHex: string;
}

export function deriveV2OnChainIdentifiers(params: {
  publicId: string;
  issuerEntityId: string;
  subjectEntityId: string;
  eventEntityId: string;
  credentialFamily: CredentialFamily;
  participationId?: string | null;
}): V2OnChainIdentifiers {
  const familyCode = credentialFamilyToContractCode(params.credentialFamily);
  const credentialIdHex = computeV2CredentialIdHex(params.publicId);
  const issuerIdHex = computeV2EntityIdHex(params.issuerEntityId);
  const subjectIdHex = computeV2EntityIdHex(params.subjectEntityId);
  const eventIdHex = computeV2EntityIdHex(params.eventEntityId);
  const scopeIdHex = computeV2ScopeIdHex(params.credentialFamily, params.participationId);
  const businessKeyHex = computeV2BusinessKeyHex({
    subjectIdHex,
    eventIdHex,
    familyCode,
    scopeIdHex,
  });

  return {
    familyCode,
    hashSchema: V2_CONTRACT_HASH_SCHEMA,
    credentialIdHex,
    issuerIdHex,
    subjectIdHex,
    eventIdHex,
    scopeIdHex,
    businessKeyHex,
  };
}

/**
 * Compares the 32-byte canonical digest persisted locally by the application
 * against the 32-byte digest read back from the Soroban contract byte-for-byte.
 */
export function compareDigests32ByteForByte(
  localDigestHex: string,
  contractDigest: string | Buffer | Uint8Array | null | undefined
): boolean {
  if (typeof localDigestHex !== 'string' || !/^[0-9a-f]{64}$/.test(localDigestHex)) {
    return false;
  }
  const localBytes = Buffer.from(localDigestHex, 'hex');
  if (localBytes.byteLength !== 32) {
    return false;
  }

  let contractBytes: Buffer;
  if (Buffer.isBuffer(contractDigest)) {
    contractBytes = contractDigest;
  } else if (ArrayBuffer.isView(contractDigest)) {
    contractBytes = Buffer.from(
      contractDigest.buffer,
      contractDigest.byteOffset,
      contractDigest.byteLength
    );
  } else if (typeof contractDigest === 'string' && /^[0-9a-fA-F]{64}$/.test(contractDigest)) {
    contractBytes = Buffer.from(contractDigest.toLowerCase(), 'hex');
  } else {
    return false;
  }

  if (contractBytes.byteLength !== 32) {
    return false;
  }

  return (
    Buffer.compare(localBytes, contractBytes) === 0 &&
    timingSafeEqual(localBytes, contractBytes)
  );
}

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
