import {
  CanonicalPayloadV2,
  CredentialFamily,
  EvidenceSourceType,
  ParticipationMode,
  V2_CONTRACT_HASH_SCHEMA,
  buildCanonicalPayloadV2,
  compareDigests32ByteForByte,
  computePayloadDigestV2,
  computeV2CredentialIdHex,
  computeV2ScopeIdHex,
  credentialFamilyToContractCode,
} from '@/domain/credentials/v2';
import { isDomainError } from '@/domain/errors';
import type { StellarGateway } from '@/ports/StellarGateway';
import { createReadOnlyPublicV2Gateway } from './SorobanCredentialV2Gateway';

export type PublicVerificationStateV2 =
  | 'draft'
  | 'local'
  | 'pending'
  | 'confirmed'
  | 'mismatch'
  | 'absent'
  | 'revoked'
  | 'unavailable';

export type PublicVerificationLabelV2 =
  | 'Borrador — sin confirmación Stellar'
  | 'Registro local — sin confirmación Stellar'
  | 'Anclaje pendiente'
  | 'Integridad confirmada en Stellar Testnet'
  | 'El contenido no coincide con el registro en Stellar'
  | 'No se encontró el registro en Stellar'
  | 'Credencial revocada'
  | 'No fue posible consultar Stellar; intenta nuevamente';

export type PublicVerificationFailureKindV2 =
  | 'rpc_error'
  | 'invalid_response'
  | 'config_error'
  | null;

export const SOW_PUBLIC_VERIFICATION_LABELS: Record<
  PublicVerificationStateV2,
  PublicVerificationLabelV2
> = {
  draft: 'Borrador — sin confirmación Stellar',
  local: 'Registro local — sin confirmación Stellar',
  pending: 'Anclaje pendiente',
  confirmed: 'Integridad confirmada en Stellar Testnet',
  mismatch: 'El contenido no coincide con el registro en Stellar',
  absent: 'No se encontró el registro en Stellar',
  revoked: 'Credencial revocada',
  unavailable: 'No fue posible consultar Stellar; intenta nuevamente',
};

export interface PresentedCredentialFieldsV2 {
  publicId: string;
  status: 'draft' | 'issued' | 'revoked';
  schemaVersion: 'culturago.credential.v2';
  credentialFamily: CredentialFamily;
  participationMode: ParticipationMode;
  participationId?: string | null;
  displayLabel: string;
  displaySubtitle: string;
  presentationCode?: string | null;
  organizationName?: string | null;
  roles: string[];
  issuedAt: string;
  issuedLedger?: number | null;
  revokedAt?: string | null;
  /** Persisted digest in PostgreSQL (`credentials.payload_digest`) — audit reference only. */
  payloadDigest: string;
  issuer: {
    id: string;
    displayName: string;
    kind: string;
    slug?: string;
  };
  subject: {
    id: string;
    displayName: string;
    kind: string;
    artisticName?: string | null;
    slug?: string;
  };
  event: {
    id: string;
    name: string;
    year?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    location?: string | null;
  };
  evidences: {
    id: string;
    sourceType: EvidenceSourceType;
    sourceId: string;
    evidenceRole: string;
    notes?: string | null;
  }[];
}

export interface HistoricalIssuanceOperationAuditRef {
  phase: string | null;
  txHash: string | null;
  ledger: number | null;
  expectedDigest: string | null;
}

export interface PublicCredentialStellarVerificationV2 {
  confirmed: boolean;
  verificationState: PublicVerificationStateV2;
  publicStatusLabel: PublicVerificationLabelV2;
  failureKind: PublicVerificationFailureKindV2;
  phase: string | null;
  txHash: string | null;
  ledger: number | null;
  historicalLedger: number | null;
  revokedOnChain: boolean;
  revokedLedger: number | null;
  contractId: string | null;
  credentialIdHex: string;
  scopeIdHex: string | null;
  recomputedDigest: string;
  persistedDigest: string;
  historicalExpectedDigest: string | null;
  readbackDigest: string | null;
  digestMatches: boolean;
  scopeMatches: boolean;
  schemaMatches: boolean;
  familyMatches: boolean;
  presentationMatchesPersistedDigest: boolean;
}

const PENDING_OPERATION_PHASES = new Set([
  'awaiting_signature',
  'signed',
  'submitted',
  'confirming',
  'restoring',
  'unknown',
  'failed_retryable',
]);

/**
 * Projects the exact `CanonicalPayloadV2` from the visible/presented fields of a
 * credential view. Both the public HTML view and the SHA-256 verification digest
 * use this single source for all covered fields, preventing silent divergence.
 */
export function projectPresentedCanonicalPayloadV2(
  view: PresentedCredentialFieldsV2
): CanonicalPayloadV2 {
  return buildCanonicalPayloadV2({
    publicId: view.publicId,
    credentialFamily: view.credentialFamily,
    participationMode: view.participationMode,
    issuer: {
      id: view.issuer.id,
      display_name: view.issuer.displayName,
      kind: view.issuer.kind,
      ...(view.issuer.slug ? { slug: view.issuer.slug } : {}),
    },
    subject: {
      id: view.subject.id,
      display_name: view.subject.displayName,
      kind: view.subject.kind,
      ...(view.subject.artisticName
        ? { artistic_name: view.subject.artisticName }
        : {}),
      ...(view.subject.slug ? { slug: view.subject.slug } : {}),
    },
    event: {
      id: view.event.id,
      name: view.event.name,
      ...(view.event.year != null ? { year: view.event.year } : {}),
      ...(view.event.startDate ? { start_date: view.event.startDate } : {}),
      ...(view.event.endDate ? { end_date: view.event.endDate } : {}),
      ...(view.event.location ? { location: view.event.location } : {}),
    },
    displayLabel: view.displayLabel,
    displaySubtitle: view.displaySubtitle,
    presentationCode: view.presentationCode ?? undefined,
    organizationName: view.organizationName ?? undefined,
    roles: view.roles,
    evidences: view.evidences.map((e) => ({
      source_type: e.sourceType,
      source_id: e.sourceId,
      evidence_role: e.evidenceRole,
    })),
    issuedAt: view.issuedAt,
  });
}

/**
 * Recomputes the 32-byte lowercase hex SHA-256 digest directly from the
 * presented credential content using the documented `culturago.credential.v2`
 * RFC 8785 JCS + domain-separator algorithm.
 */
export function recomputePresentedDigestV2(view: PresentedCredentialFieldsV2): {
  presentedPayload: CanonicalPayloadV2;
  recomputedDigest: string;
} {
  const presentedPayload = projectPresentedCanonicalPayloadV2(view);
  const recomputedDigest = computePayloadDigestV2(presentedPayload);
  return { presentedPayload, recomputedDigest };
}

export function isDevEnvironmentForPublicDemo(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_ENVIRONMENT === 'development' ||
    process.env.NEXT_PUBLIC_APP_ENV === 'dev' ||
    process.env.CULTURAGO_ENV === 'development'
  );
}

/**
 * Strictly restricts DEV synthetic demo variants (`?demo=mismatch` / `?demo=unavailable`)
 * to synthetic test credentials. Never matches real FDVC pilot records.
 */
export function isSyntheticDemoCredentialV2(
  view: Pick<
    PresentedCredentialFieldsV2,
    'presentationCode' | 'issuer' | 'subject' | 'event'
  >
): boolean {
  const code = view.presentationCode?.trim() ?? '';
  if (/^FDVC/i.test(code)) {
    return false;
  }
  if (/^(D[1-4]-SINT-|DEV-|SINT-|DEMO-)/i.test(code)) {
    return true;
  }
  const combinedMarkers = [
    view.issuer.slug,
    view.issuer.displayName,
    view.subject.slug,
    view.subject.displayName,
    view.event.name,
  ]
    .filter(Boolean)
    .join(' ');
  return /(sint[eé]tic|demo)/i.test(combinedMarkers);
}

export type SyntheticDemoMode = 'mismatch' | 'unavailable';

export interface SyntheticDemoResolution<T extends PresentedCredentialFieldsV2> {
  view: T;
  activeDemoMode: SyntheticDemoMode | null;
  alteredField: string | null;
  originalValue: string | null;
  alteredValue: string | null;
}

/**
 * Applies a strictly DEV-gated, synthetic-credential-scoped demo variant in memory
 * without mutating PostgreSQL or the anchored Stellar Testnet record.
 */
export function applySyntheticDevDemoVariant<
  T extends PresentedCredentialFieldsV2,
>(view: T, requestedDemoParam?: string | null): SyntheticDemoResolution<T> {
  const normalized = requestedDemoParam?.trim().toLowerCase();
  if (
    !normalized ||
    (normalized !== 'mismatch' && normalized !== 'unavailable') ||
    !isDevEnvironmentForPublicDemo() ||
    !isSyntheticDemoCredentialV2(view)
  ) {
    return {
      view,
      activeDemoMode: null,
      alteredField: null,
      originalValue: null,
      alteredValue: null,
    };
  }

  if (normalized === 'mismatch') {
    const originalSubtitle = view.displaySubtitle;
    const alteredSubtitle = `${originalSubtitle} — Variante sintética alterada (D3)`;
    return {
      view: {
        ...view,
        displaySubtitle: alteredSubtitle,
      },
      activeDemoMode: 'mismatch',
      alteredField: 'claim.display_subtitle',
      originalValue: originalSubtitle,
      alteredValue: alteredSubtitle,
    };
  }

  return {
    view,
    activeDemoMode: 'unavailable',
    alteredField: null,
    originalValue: null,
    alteredValue: null,
  };
}

export interface VerifyPresentedCredentialOptions {
  gateway?: StellarGateway;
  contractId?: string | null;
  /** Controlled per-request fault strictly for DEV synthetic Case 3 (`?demo=unavailable`). */
  simulateUnavailableForSyntheticDemo?: boolean;
}

/**
 * D3 Public Verification Orchestrator:
 * - Recalculates the 32-byte canonical digest from the presented content.
 * - Requires BOTH a confirmed issuance operation AND a valid matching Testnet
 *   contract read-back (`get_credential` + `get_v2_scope`, `hash_schema == 2`,
 *   `familyCode`, `scopeId`, entity hashes, and 32-byte `compareDigests32ByteForByte`).
 * - Separately reports `draft`, `local`, `pending`, `confirmed`, `mismatch`,
 *   `absent`, `revoked`, and `unavailable` (distinguishing `rpc_error`,
 *   `invalid_response`, and `config_error`).
 */
export async function verifyPresentedCredentialV2(
  view: PresentedCredentialFieldsV2,
  operation: HistoricalIssuanceOperationAuditRef | null,
  options?: VerifyPresentedCredentialOptions
): Promise<{
  presentedPayload: CanonicalPayloadV2;
  stellar: PublicCredentialStellarVerificationV2;
}> {
  const { presentedPayload, recomputedDigest } = recomputePresentedDigestV2(view);
  const credentialIdHex = computeV2CredentialIdHex(view.publicId);
  const scopeIdHex =
    view.credentialFamily === 'staff' || view.participationId
      ? computeV2ScopeIdHex(view.credentialFamily, view.participationId)
      : null;

  const presentationMatchesPersistedDigest = compareDigests32ByteForByte(
    recomputedDigest,
    view.payloadDigest
  );

  const configuredContractId =
    options?.contractId ??
    (process.env.NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID?.trim() || null);

  const historicalPhase = operation?.phase ?? null;
  const historicalTxHash = operation?.txHash ?? null;
  const historicalLedger = operation?.ledger ?? view.issuedLedger ?? null;
  const historicalExpectedDigest = operation?.expectedDigest ?? null;

  const buildResult = (
    state: PublicVerificationStateV2,
    overrides: Partial<PublicCredentialStellarVerificationV2> = {}
  ): {
    presentedPayload: CanonicalPayloadV2;
    stellar: PublicCredentialStellarVerificationV2;
  } => ({
    presentedPayload,
    stellar: {
      confirmed: state === 'confirmed',
      verificationState: state,
      publicStatusLabel: SOW_PUBLIC_VERIFICATION_LABELS[state],
      failureKind: null,
      phase: historicalPhase,
      txHash: historicalTxHash,
      ledger: state === 'confirmed' ? (overrides.ledger ?? historicalLedger) : null,
      historicalLedger,
      revokedOnChain: false,
      revokedLedger: null,
      contractId: configuredContractId,
      credentialIdHex,
      scopeIdHex,
      recomputedDigest,
      persistedDigest: view.payloadDigest,
      historicalExpectedDigest,
      readbackDigest: null,
      digestMatches: false,
      scopeMatches: false,
      schemaMatches: false,
      familyMatches: false,
      presentationMatchesPersistedDigest,
      ...overrides,
    },
  });

  // 1. Draft credential -> "Borrador — sin confirmación Stellar"
  if (view.status === 'draft') {
    return buildResult('draft');
  }

  // 2. Locally revoked credential -> "Credencial revocada"
  if (view.status === 'revoked') {
    return buildResult('revoked');
  }

  // 3. No Stellar operation or terminally failed unconfirmed operation -> "Registro local — sin confirmación Stellar"
  if (!operation || !historicalPhase || historicalPhase === 'failed_terminal') {
    return buildResult('local');
  }

  // 4. Operation exists in a non-confirmed phase (or missing tx_hash / ledger) -> "Anclaje pendiente"
  const hasConfirmedOperation =
    historicalPhase === 'confirmed' &&
    Boolean(historicalTxHash) &&
    historicalLedger !== null;

  if (!hasConfirmedOperation) {
    if (PENDING_OPERATION_PHASES.has(historicalPhase) || historicalPhase === 'confirmed') {
      return buildResult('pending');
    }
    return buildResult('local');
  }

  // 5. Confirmed issuance operation exists -> perform live read-only query on Stellar Testnet
  let gateway: StellarGateway;
  let resolvedContractId = configuredContractId;

  try {
    if (options?.simulateUnavailableForSyntheticDemo) {
      // Controlled per-request unreachable loopback Soroban RPC (strictly scoped to synthetic DEV demo)
      const faulted = createReadOnlyPublicV2Gateway({
        rpcUrlOverride: 'http://127.0.0.1:1',
        timeoutInSeconds: 2,
      });
      gateway = faulted.gateway;
      resolvedContractId = faulted.contractId;
    } else if (options?.gateway) {
      gateway = options.gateway;
    } else {
      const isUnitTestWithoutOverride =
        process.env.VITEST === 'true' &&
        process.env.CULTURAGO_TEST_LIVE_SOROBAN !== 'true';
      const resolved = createReadOnlyPublicV2Gateway();
      if (isUnitTestWithoutOverride && !options?.gateway) {
        // Note: createReadOnlyPublicV2Gateway returns injected test overrides above;
        // if a Vitest test has a confirmed DB operation WITHOUT injecting a mock gateway,
        // avoid unintended external network calls unless CULTURAGO_TEST_LIVE_SOROBAN=true.
        const {
          getCredentialV2GatewayOverrideForTests,
          getPublicCredentialV2ReadGatewayOverrideForTests,
        } = await import('./SorobanCredentialV2Gateway');
        if (
          !getCredentialV2GatewayOverrideForTests() &&
          !getPublicCredentialV2ReadGatewayOverrideForTests()
        ) {
          return buildResult('unavailable', {
            failureKind: 'config_error',
            contractId: resolved.contractId,
          });
        }
      }
      gateway = resolved.gateway;
      resolvedContractId = resolved.contractId;
    }
  } catch (err) {
    const failureKind: PublicVerificationFailureKindV2 = isDomainError(
      err,
      'INVALID_CHAIN_RESPONSE'
    )
      ? 'invalid_response'
      : 'config_error';
    return buildResult('unavailable', { failureKind });
  }

  const familyCode = credentialFamilyToContractCode(view.credentialFamily);

  try {
    const chain = await gateway.verifyCredentialV2({
      publicId: view.publicId,
      payloadDigest: recomputedDigest,
      participationId: view.participationId,
      familyCode,
      issuerEntityId: view.issuer.id,
      subjectEntityId: view.subject.id,
      eventEntityId: view.event.id,
    });

    // Valid Option::None absence on-chain -> "No se encontró el registro en Stellar"
    if (!chain.exists) {
      return buildResult('absent', {
        contractId: resolvedContractId,
      });
    }

    const digestMatches = Boolean(
      chain.readbackDigest &&
        compareDigests32ByteForByte(recomputedDigest, chain.readbackDigest)
    );
    const schemaMatches = chain.hashSchema === V2_CONTRACT_HASH_SCHEMA;
    const familyMatches = chain.familyCode === familyCode;
    const scopeMatches = Boolean(chain.scopeMatches);

    // Existing revocation exposed by contract -> "Credencial revocada"
    if (chain.revoked) {
      return buildResult('revoked', {
        contractId: resolvedContractId,
        revokedOnChain: true,
        revokedLedger: chain.revokedLedger ?? null,
        readbackDigest: chain.readbackDigest,
        scopeIdHex: chain.scopeIdHex ?? scopeIdHex,
        digestMatches,
        scopeMatches,
        schemaMatches,
        familyMatches,
      });
    }

    // Confirmed 32-byte digest + V2 identifier/schema/family/scope/entity checks
    const allChecksMatch = Boolean(
      chain.matches &&
        digestMatches &&
        schemaMatches &&
        familyMatches &&
        scopeMatches &&
        chain.ledger !== null &&
        chain.ledger > 0
    );

    if (allChecksMatch) {
      return buildResult('confirmed', {
        contractId: resolvedContractId,
        ledger: chain.ledger ?? historicalLedger,
        readbackDigest: chain.readbackDigest,
        scopeIdHex: chain.scopeIdHex ?? scopeIdHex,
        digestMatches: true,
        scopeMatches: true,
        schemaMatches: true,
        familyMatches: true,
      });
    }

    // Record exists and is valid, but recomputed digest or V2 attributes do not match -> "El contenido no coincide con el registro en Stellar"
    return buildResult('mismatch', {
      contractId: resolvedContractId,
      readbackDigest: chain.readbackDigest,
      scopeIdHex: chain.scopeIdHex ?? scopeIdHex,
      digestMatches,
      scopeMatches,
      schemaMatches,
      familyMatches,
    });
  } catch (err) {
    const failureKind: PublicVerificationFailureKindV2 = isDomainError(
      err,
      'INVALID_CHAIN_RESPONSE'
    )
      ? 'invalid_response'
      : 'rpc_error';
    return buildResult('unavailable', {
      contractId: resolvedContractId,
      failureKind,
    });
  }
}
