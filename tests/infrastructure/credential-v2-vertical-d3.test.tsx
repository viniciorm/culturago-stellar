// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { render, screen, cleanup } from '@testing-library/react';
import { PostgreSQLIdentityStore } from '@/infrastructure/auth/PostgreSQLIdentityStore';
import { SessionService } from '@/infrastructure/auth/SessionService';
import {
  issueCredentialV2,
  issueParticipantCredentialV2FromOrganizer,
  revokeCredentialV2,
} from '@/app/organizer/credential-v2-actions';
import { closePool, query } from '@/infrastructure/database/pool';
import { InMemoryChainTransport } from '@/infrastructure/stellar/InMemoryChainTransport';
import { DEMO_CONFIG, MockSigner } from '@/infrastructure/stellar/MockStellarGateway';
import { PostgreSQLOperationStore } from '@/infrastructure/stellar/PostgreSQLOperationStore';
import { SorobanStellarGateway } from '@/infrastructure/stellar/SorobanStellarGateway';
import {
  SorobanCredentialV2Gateway,
  setCredentialV2GatewayOverrideForTests,
  setPublicCredentialV2ReadGatewayOverrideForTests,
} from '@/infrastructure/credentials/v2/SorobanCredentialV2Gateway';
import { CredentialV2Service } from '@/infrastructure/credentials/v2/CredentialV2Service';
import {
  SOW_PUBLIC_VERIFICATION_LABELS,
  verifyPresentedCredentialV2,
} from '@/infrastructure/credentials/v2/publicVerification';
import {
  compareDigests32ByteForByte,
  computePayloadDigestV2,
  computeV2CredentialIdHex,
} from '@/domain/credentials/v2';
import CredentialV2PublicPage, {
  CredentialV2PublicView,
} from '@/app/credentials/[publicId]/page';
import {
  assertIsolatedTestDatabase,
  validateTestDatabaseUrl,
} from '../fixtures/assertIsolatedTestDatabase';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:test@127.0.0.1:5433/culturago_test';
validateTestDatabaseUrl(testDbUrl);
process.env.DATABASE_URL = testDbUrl;
process.env.NEXT_PUBLIC_CULTURAGO_ENV = 'testnet';
process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE =
  'Test SDF Network ; September 2015';
process.env.NEXT_PUBLIC_STELLAR_RPC_URL = 'https://soroban-testnet.stellar.org';
process.env.WEBAUTHN_RP_ID = 'localhost';
process.env.WEBAUTHN_ORIGINS = 'http://localhost:3000';

const D3_CONTRACT_ID =
  'CBKX6WIZ25IKKPHIDSTEPLLLMQMRK3DFO5UD3H5YZVXJZ452JNIYHYW6';
const D3_OPERATOR_ADDRESS =
  'GA5PR7FSYR3U4UQEMAFHBZ5VASPIXZLUKCGCURP6V3SGIJJLW2XB7NGL';

const sessionCookieState = vi.hoisted(() => ({
  token: null as string | null,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'culturago_session' && sessionCookieState.token
        ? { name: 'culturago_session', value: sessionCookieState.token }
        : undefined,
  }),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn() }),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

describe('D3 Vertical: Stellar-Backed Public Verification Without Session or Signing Keys', () => {
  const issuerId = randomUUID();
  const subjectId = randomUUID();
  const eventMatchId = randomUUID();
  const eventMismatchId = randomUUID();
  const eventLocalId = randomUUID();
  const eventDraftId = randomUUID();
  const eventPendingId = randomUUID();
  const eventAbsentId = randomUUID();
  const eventUnavailableId = randomUUID();
  const eventRevokedChainId = randomUUID();
  const eventRevokedLocalId = randomUUID();
  const eventPilotGuardId = randomUUID();

  const partMatchId = randomUUID();
  const partMismatchId = randomUUID();
  const partLocalId = randomUUID();
  const partDraftId = randomUUID();
  const partPendingId = randomUUID();
  const partAbsentId = randomUUID();
  const partUnavailableId = randomUUID();
  const partRevokedChainId = randomUUID();
  const partRevokedLocalId = randomUUID();
  const partPilotGuardId = randomUUID();

  const operatorAccountId = randomUUID();

  let operatorSessionToken: string;
  let transport: InMemoryChainTransport;
  let pgOperationStore: PostgreSQLOperationStore;
  let keylessPublicGateway: SorobanStellarGateway;
  let dbGuardVerified = false;
  const createdPublicIds: string[] = [];

  const allEventIds = [
    eventMatchId,
    eventMismatchId,
    eventLocalId,
    eventDraftId,
    eventPendingId,
    eventAbsentId,
    eventUnavailableId,
    eventRevokedChainId,
    eventRevokedLocalId,
    eventPilotGuardId,
  ];
  const allParticipationIds = [
    partMatchId,
    partMismatchId,
    partLocalId,
    partDraftId,
    partPendingId,
    partAbsentId,
    partUnavailableId,
    partRevokedChainId,
    partRevokedLocalId,
    partPilotGuardId,
  ];

  beforeAll(async () => {
    await assertIsolatedTestDatabase(testDbUrl, query);
    dbGuardVerified = true;
    process.env.NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID = D3_CONTRACT_ID;

    const identityStore = new PostgreSQLIdentityStore();
    const sessionService = new SessionService(identityStore);

    await query(
      `INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active)
       VALUES
         ($1, 'organization', 'Agrupación Emisora Sintética D3', $2, 'Chile', 'Santiago', 'verified', true, true),
         ($3, 'person', 'Camila Solista Sintética D3', $4, 'Chile', 'Santiago', 'verified', true, true)`,
      [
        issuerId,
        `org-d3-sintetica-${issuerId.slice(0, 8)}`,
        subjectId,
        `camila-d3-sintetica-${subjectId.slice(0, 8)}`,
      ]
    );

    await query(
      `INSERT INTO people (entity_id, legal_name, artistic_name, main_role)
       VALUES ($1, 'Camila Legal Sintética', 'Kamila D3', 'dancer')`,
      [subjectId]
    );

    for (let i = 0; i < allEventIds.length; i++) {
      const eid = allEventIds[i];
      const isPilot = eid === eventPilotGuardId;
      const evName = isPilot
        ? 'Festival Nacional Danza del Vientre Chile 2026'
        : `Muestra Sintética D3 Caso ${i + 1} 2026`;
      await query(
        `INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active)
         VALUES ($1, 'event', $2, $3, 'Chile', 'Santiago', 'verified', true, true)`,
        [eid, evName, `evt-d3-${i + 1}-${eid.slice(0, 8)}`]
      );
      await query(
        `INSERT INTO events (entity_id, name, year, start_date, end_date, location, organizer_entity_id)
         VALUES ($1, $2, 2026, '2026-11-26', '2026-11-27', 'Ñuñoa, Santiago', $3)`,
        [eid, evName, issuerId]
      );
      await query(
        `INSERT INTO participations (id, subject_entity_id, event_id, state, presentation_code)
         VALUES ($1, $2, $3, 'participation_confirmed', $4)`,
        [
          allParticipationIds[i],
          subjectId,
          eid,
          isPilot ? 'FDVC2026-999' : `D3-SINT-00${i + 1}`,
        ]
      );
    }

    await identityStore.createAccount({
      id: operatorAccountId,
      status: 'active',
      personEntityId: null,
      walletContractAddress:
        'CD3SIMULATEDWALLET00000000000000000000000000000000000001',
    });
    await identityStore.grantRole(operatorAccountId, 'operator');
    await identityStore.linkIssuerOperator(issuerId, operatorAccountId);
    operatorSessionToken = (await sessionService.create(operatorAccountId))
      .sessionToken;

    transport = new InMemoryChainTransport();
    pgOperationStore = new PostgreSQLOperationStore();

    const signingGateway = new SorobanStellarGateway(
      {
        ...DEMO_CONFIG,
        environment: 'testnet',
        networkPassphrase: 'Test SDF Network ; September 2015',
        credentialRegistryContractId: D3_CONTRACT_ID,
      },
      transport,
      pgOperationStore,
      new MockSigner(D3_OPERATOR_ADDRESS)
    );

    // Keyless read-only gateway (signer = null, no operator secrets)
    keylessPublicGateway = new SorobanStellarGateway(
      {
        ...DEMO_CONFIG,
        environment: 'testnet',
        networkPassphrase: 'Test SDF Network ; September 2015',
        credentialRegistryContractId: D3_CONTRACT_ID,
        feePayerAddress: null,
        feePayerSecret: null,
      },
      transport,
      pgOperationStore,
      null
    );

    setCredentialV2GatewayOverrideForTests(
      new SorobanCredentialV2Gateway({
        gateway: signingGateway,
        store: pgOperationStore,
        contractId: D3_CONTRACT_ID,
        network: 'testnet',
        operatorAddress: D3_OPERATOR_ADDRESS,
      })
    );
    setPublicCredentialV2ReadGatewayOverrideForTests({
      gateway: keylessPublicGateway,
      contractId: D3_CONTRACT_ID,
    });
  });

  afterAll(async () => {
    setCredentialV2GatewayOverrideForTests(null);
    setPublicCredentialV2ReadGatewayOverrideForTests(null);
    if (dbGuardVerified) {
      const credsRes = await query<{ id: string; public_id: string }>(
        `SELECT id, public_id FROM credentials WHERE issuer_entity_id = $1`,
        [issuerId]
      );
      const credIds = credsRes.rows.map((r) => r.id);
      const opKeys = [
        ...new Set([
          ...createdPublicIds.map((p) => `issue_v2:${p}`),
          ...credsRes.rows.map((r) => `issue_v2:${r.public_id}`),
        ]),
      ];
      if (opKeys.length > 0) {
        await query(
          `DELETE FROM stellar_operations WHERE idempotency_key = ANY($1::text[])`,
          [opKeys]
        );
      }
      if (credIds.length > 0) {
        await query(
          `DELETE FROM credential_evidence WHERE credential_id = ANY($1::uuid[])`,
          [credIds]
        );
        await query(`DELETE FROM credentials WHERE id = ANY($1::uuid[])`, [
          credIds,
        ]);
      }

      await query(`DELETE FROM sessions WHERE account_id = $1`, [
        operatorAccountId,
      ]);
      await query(
        `DELETE FROM issuer_operators WHERE operator_account_id = $1`,
        [operatorAccountId]
      );
      await query(`DELETE FROM account_roles WHERE account_id = $1`, [
        operatorAccountId,
      ]);
      await query(`DELETE FROM accounts WHERE id = $1`, [operatorAccountId]);

      await query(`DELETE FROM participations WHERE id = ANY($1::uuid[])`, [
        allParticipationIds,
      ]);
      await query(`DELETE FROM events WHERE entity_id = ANY($1::uuid[])`, [
        allEventIds,
      ]);
      await query(`DELETE FROM people WHERE entity_id = $1`, [subjectId]);
      await query(`DELETE FROM entities WHERE id = ANY($1::uuid[])`, [
        [issuerId, subjectId, ...allEventIds],
      ]);
    }
    await closePool();
  });

  beforeEach(() => {
    cleanup();
    transport.nextReadbackCorruptMetadataHash = null;
    transport.nextReadbackError = null;
    transport.nextReadbackRawOverride = { active: false, value: null };
    transport.nextSubmissionStaysPending = false;
  });

  it('1. 32-byte match without session or signing keys: recalculates presented digest, verifies V2 record on Testnet, displays exact SOW label and scope/limits disclosures, and keeps single source when related tables change', async () => {
    sessionCookieState.token = operatorSessionToken;
    const issued = await issueParticipantCredentialV2FromOrganizer({
      participationId: partMatchId,
      issuerEntityId: issuerId,
      subjectEntityId: subjectId,
      eventEntityId: eventMatchId,
    });
    const publicId = issued.credential.publicId;
    createdPublicIds.push(publicId);
    expect(issued.gateway.simulated).toBe(false);
    expect(issued.gateway.onChainConfirmed).toBe(true);

    // Attach optional non-covered descriptive note on credential_evidence and edit related `people` / `entities`
    // to prove single-source stability + explicit non-covered metadata disclosure
    await query(
      `UPDATE credential_evidence SET notes = 'Nota operativa interna no cubierta por el hash' WHERE credential_id = $1`,
      [issued.credential.id]
    );
    await query(
      `UPDATE people SET artistic_name = 'Nombre Editado En Directorio Posterior' WHERE entity_id = $1`,
      [subjectId]
    );

    // Clear session AND remove any signing env vars to prove public verification is 100% sessionless & keyless
    sessionCookieState.token = null;
    const savedOpSecret = process.env.STELLAR_TESTNET_OPERATOR_SECRET;
    const savedMutations = process.env.CULTURAGO_ALLOW_TESTNET_MUTATIONS;
    delete process.env.STELLAR_TESTNET_OPERATOR_SECRET;
    process.env.CULTURAGO_ALLOW_TESTNET_MUTATIONS = 'false';

    try {
      const jsx = await CredentialV2PublicPage({
        params: Promise.resolve({ publicId }),
      });
      render(jsx);

      const statusBadge = screen.getByTestId('public-verification-status');
      expect(statusBadge.textContent).toBe(
        SOW_PUBLIC_VERIFICATION_LABELS.confirmed
      );
      expect(statusBadge.getAttribute('data-verification-state')).toBe(
        'confirmed'
      );

      // Single source check: displays attested artistic name 'Kamila D3', not the mutated directory name
      expect(screen.getByTestId('presented-subject-name').textContent).toContain(
        'Kamila D3'
      );

      // Recomputed 32-byte digest matches contract readback digest byte-for-byte
      const recomputedHex =
        screen.getByTestId('recomputed-digest').textContent!;
      const contractHex = screen.getByTestId(
        'contract-readback-digest'
      ).textContent!;
      expect(compareDigests32ByteForByte(recomputedHex, contractHex)).toBe(
        true
      );
      expect(recomputedHex).toBe(issued.credential.payloadDigest);

      // Non-covered note disclosure
      expect(
        screen.getByText(
          /Nota descriptiva complementaria \(fuera del digest canónico\)/i
        )
      ).toBeDefined();

      // Proof limits disclosure (integrity of covered data, issuer backing, no legal identity / official accreditation)
      const limitsText = screen.getByTestId(
        'verification-scope-and-limits'
      ).textContent!;
      expect(limitsText).toContain('Integridad de los datos cubiertos por la huella');
      expect(limitsText).toContain('entidad emisora');
      expect(limitsText).toContain('no certifica la identidad legal civil');
      expect(limitsText).toContain(
        'acreditación oficial o gubernamental de la autoridad del emisor'
      );
    } finally {
      await query(
        `UPDATE people SET artistic_name = 'Kamila D3' WHERE entity_id = $1`,
        [subjectId]
      );
      if (savedOpSecret !== undefined) {
        process.env.STELLAR_TESTNET_OPERATOR_SECRET = savedOpSecret;
      }
      if (savedMutations !== undefined) {
        process.env.CULTURAGO_ALLOW_TESTNET_MUTATIONS = savedMutations;
      }
    }
  });

  it('2. Detects divergence between what the credential page displays and the persisted/canonical payload used for audit', async () => {
    sessionCookieState.token = operatorSessionToken;
    const issued = await issueParticipantCredentialV2FromOrganizer({
      participationId: partMismatchId,
      issuerEntityId: issuerId,
      subjectEntityId: subjectId,
      eventEntityId: eventMismatchId,
    });
    const publicId = issued.credential.publicId;
    createdPublicIds.push(publicId);

    sessionCookieState.token = null;
    const service = new CredentialV2Service();
    const cleanView = await service.getCredentialByPublicId(publicId);
    expect(cleanView).not.toBeNull();
    expect(cleanView!.stellar?.verificationState).toBe('confirmed');

    // Simulate a divergence bug where a caller mutates what the UI displays (`displaySubtitle`)
    // while leaving `payloadDigest`, `canonicalPayload`, and `stellar` untouched as 'confirmed'!
    const divergedView = {
      ...cleanView!,
      displaySubtitle: 'Solista — Texto Visible Divergente',
    };
    expect(divergedView.payloadDigest).toBe(issued.credential.payloadDigest);
    expect(divergedView.canonicalPayload.claim.display_subtitle).toBe('Solista');
    expect(divergedView.stellar?.verificationState).toBe('confirmed');

    const jsx = await CredentialV2PublicView({ credential: divergedView });
    render(jsx);

    // Must render the visible diverged text AND recompute from it, catching the mismatch!
    expect(
      screen.getByTestId('presented-display-subtitle').textContent
    ).toBe('Solista — Texto Visible Divergente');
    expect(screen.getByTestId('public-verification-status').textContent).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.mismatch
    );

    const recomputedHex = screen.getByTestId('recomputed-digest').textContent!;
    const contractHex = screen.getByTestId(
      'contract-readback-digest'
    ).textContent!;
    const persistedHex = screen.getByTestId(
      'persisted-audit-digest'
    ).textContent!;

    expect(persistedHex).toBe(issued.credential.payloadDigest);
    expect(contractHex).toBe(issued.credential.payloadDigest);
    expect(recomputedHex).not.toBe(contractHex);
    expect(compareDigests32ByteForByte(recomputedHex, contractHex)).toBe(false);
  });

  it('3. Reports mismatch on altered covered field in DB, on DEV synthetic ?demo=mismatch, and on V2 scope/schema mismatch — while guarding non-synthetic credentials', async () => {
    // A. DEV synthetic ?demo=mismatch on the confirmed credential from Test 2 preserves DB & chain intact
    const service = new CredentialV2Service();
    const mismatchCredPublicId = createdPublicIds[1];

    const demoMismatchJsx = await CredentialV2PublicPage({
      params: Promise.resolve({ publicId: mismatchCredPublicId }),
      searchParams: Promise.resolve({ demo: 'mismatch' }),
    });
    render(demoMismatchJsx);
    expect(screen.getByTestId('public-verification-status').textContent).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.mismatch
    );
    expect(
      screen.getByTestId('presented-display-subtitle').textContent
    ).toContain('Variante sintética alterada (D3)');

    // Base credential URL remains intact and confirmed!
    cleanup();
    const cleanAgainJsx = await CredentialV2PublicPage({
      params: Promise.resolve({ publicId: mismatchCredPublicId }),
    });
    render(cleanAgainJsx);
    expect(screen.getByTestId('public-verification-status').textContent).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.confirmed
    );

    // B. Altering a covered column (`display_subtitle`) directly in PostgreSQL triggers mismatch
    cleanup();
    await query(
      `UPDATE credentials SET display_subtitle = 'Categoría Alterada En DB' WHERE public_id = $1`,
      [mismatchCredPublicId]
    );
    try {
      const dbTamperedJsx = await CredentialV2PublicPage({
        params: Promise.resolve({ publicId: mismatchCredPublicId }),
      });
      render(dbTamperedJsx);
      expect(screen.getByTestId('public-verification-status').textContent).toBe(
        SOW_PUBLIC_VERIFICATION_LABELS.mismatch
      );
    } finally {
      await query(
        `UPDATE credentials SET display_subtitle = 'Solista' WHERE public_id = $1`,
        [mismatchCredPublicId]
      );
    }

    // C. V2 scope mismatch on contract (even when 32-byte payload digest matches!) triggers mismatch
    const cleanView = (await service.getCredentialByPublicId(
      mismatchCredPublicId
    ))!;
    const wrongScopeGateway = {
      ...keylessPublicGateway,
      verifyCredentialV2: async () => ({
        exists: true,
        matches: false,
        revoked: false,
        ledger: 1005,
        credentialIdHex: computeV2CredentialIdHex(mismatchCredPublicId),
        scopeIdHex: 'f'.repeat(64),
        readbackDigest: cleanView.payloadDigest,
        hashSchema: 2,
        familyCode: 101,
        tokenId: '2',
        scopeMatches: false,
      }),
    } as unknown as SorobanStellarGateway;

    const scopeMismatchResult = await verifyPresentedCredentialV2(
      cleanView,
      cleanView.historicalOperation ?? null,
      { gateway: wrongScopeGateway, contractId: D3_CONTRACT_ID }
    );
    expect(scopeMismatchResult.stellar.verificationState).toBe('mismatch');
    expect(scopeMismatchResult.stellar.publicStatusLabel).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.mismatch
    );

    // D. Guardrail: FDVC2026-* pilot credentials ignore ?demo=mismatch and ?demo=unavailable
    sessionCookieState.token = operatorSessionToken;
    const pilotCred = await issueParticipantCredentialV2FromOrganizer({
      participationId: partPilotGuardId,
      issuerEntityId: issuerId,
      subjectEntityId: subjectId,
      eventEntityId: eventPilotGuardId,
    });
    createdPublicIds.push(pilotCred.credential.publicId);
    sessionCookieState.token = null;

    cleanup();
    const pilotWithDemoParamJsx = await CredentialV2PublicPage({
      params: Promise.resolve({ publicId: pilotCred.credential.publicId }),
      searchParams: Promise.resolve({ demo: 'mismatch' }),
    });
    render(pilotWithDemoParamJsx);
    expect(screen.getByTestId('public-verification-status').textContent).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.confirmed
    );
  });

  it('4. Reports Draft ("Borrador — sin confirmación Stellar") and Local ("Registro local — sin confirmación Stellar") accurately', async () => {
    sessionCookieState.token = operatorSessionToken;

    // Local off-chain credential (no stellar_operations row)
    const localCred = await issueCredentialV2({
      issuerEntityId: issuerId,
      subjectEntityId: subjectId,
      eventEntityId: eventLocalId,
      credentialFamily: 'participant',
      participationMode: 'solo',
      participationId: partLocalId,
      displayLabel: 'Participante',
      displaySubtitle: 'Solista',
      presentationCode: 'D3-SINT-003',
      organizationName: 'Agrupación Emisora Sintética D3',
      roles: ['dancer'],
      evidences: [
        {
          sourceType: 'participation',
          sourceId: partLocalId,
          evidenceRole: 'confirmed_solo_performance',
        },
      ],
    });
    createdPublicIds.push(localCred.publicId);

    // Draft credential
    const draftCred = await issueCredentialV2({
      issuerEntityId: issuerId,
      subjectEntityId: subjectId,
      eventEntityId: eventDraftId,
      credentialFamily: 'participant',
      participationMode: 'solo',
      participationId: partDraftId,
      displayLabel: 'Participante',
      displaySubtitle: 'Solista',
      presentationCode: 'D3-SINT-004',
      organizationName: 'Agrupación Emisora Sintética D3',
      roles: ['dancer'],
      evidences: [
        {
          sourceType: 'participation',
          sourceId: partDraftId,
          evidenceRole: 'confirmed_solo_performance',
        },
      ],
    });
    createdPublicIds.push(draftCred.publicId);
    await query(`UPDATE credentials SET status = 'draft' WHERE id = $1`, [
      draftCred.id,
    ]);

    sessionCookieState.token = null;

    const localJsx = await CredentialV2PublicPage({
      params: Promise.resolve({ publicId: localCred.publicId }),
    });
    render(localJsx);
    expect(screen.getByTestId('public-verification-status').textContent).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.local
    );

    cleanup();
    const draftJsx = await CredentialV2PublicPage({
      params: Promise.resolve({ publicId: draftCred.publicId }),
    });
    render(draftJsx);
    expect(screen.getByTestId('public-verification-status').textContent).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.draft
    );
  });

  it('5. Reports Pending ("Anclaje pendiente") when operation is not yet confirmed — even if on-chain tx settled in the meantime', async () => {
    sessionCookieState.token = operatorSessionToken;
    transport.nextSubmissionStaysPending = true;

    const pendingAttempt = await issueParticipantCredentialV2FromOrganizer({
      participationId: partPendingId,
      issuerEntityId: issuerId,
      subjectEntityId: subjectId,
      eventEntityId: eventPendingId,
    });
    const publicId = pendingAttempt.credential.publicId;
    createdPublicIds.push(publicId);
    expect(pendingAttempt.gateway.simulated).toBe(false);
    if (!pendingAttempt.gateway.simulated) {
      expect(pendingAttempt.gateway.phase).toBe('unknown');
    }

    // Even though InMemoryChainTransport applied the credential in memory, stellar_operations.phase
    // is 'unknown' (not 'confirmed'), so public verification MUST report 'Anclaje pendiente'!
    sessionCookieState.token = null;
    const pendingJsx = await CredentialV2PublicPage({
      params: Promise.resolve({ publicId }),
    });
    render(pendingJsx);
    expect(screen.getByTestId('public-verification-status').textContent).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.pending
    );

    // Also test explicit 'submitted' and 'confirming' phases
    for (const phase of ['submitted', 'confirming', 'awaiting_signature'] as const) {
      cleanup();
      await query(
        `UPDATE stellar_operations SET phase = $1 WHERE idempotency_key = $2`,
        [phase, `issue_v2:${publicId}`]
      );
      const jsx = await CredentialV2PublicPage({
        params: Promise.resolve({ publicId }),
      });
      render(jsx);
      expect(screen.getByTestId('public-verification-status').textContent).toBe(
        SOW_PUBLIC_VERIFICATION_LABELS.pending
      );
    }
  });

  it('6. Separately reports Valid Absence ("No se encontró el registro en Stellar") vs Unavailability ("No fue posible consultar Stellar; intenta nuevamente") for both RPC errors and invalid responses', async () => {
    sessionCookieState.token = operatorSessionToken;

    // Issue two confirmed credentials: one whose on-chain entry will be removed (valid absence),
    // and one used to test RPC failure / invalid contract response / ?demo=unavailable.
    const absentIssued = await issueParticipantCredentialV2FromOrganizer({
      participationId: partAbsentId,
      issuerEntityId: issuerId,
      subjectEntityId: subjectId,
      eventEntityId: eventAbsentId,
    });
    const absentPublicId = absentIssued.credential.publicId;
    createdPublicIds.push(absentPublicId);

    const unavailIssued = await issueParticipantCredentialV2FromOrganizer({
      participationId: partUnavailableId,
      issuerEntityId: issuerId,
      subjectEntityId: subjectId,
      eventEntityId: eventUnavailableId,
    });
    const unavailPublicId = unavailIssued.credential.publicId;
    createdPublicIds.push(unavailPublicId);

    sessionCookieState.token = null;

    // A. Valid Absence: contract returns null (Option::None)
    transport.deleteCredentialForTest(
      computeV2CredentialIdHex(absentPublicId)
    );
    const absentJsx = await CredentialV2PublicPage({
      params: Promise.resolve({ publicId: absentPublicId }),
    });
    render(absentJsx);
    expect(screen.getByTestId('public-verification-status').textContent).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.absent
    );

    // B. RPC Network/Simulation Error -> Unavailable (failureKind = rpc_error)
    cleanup();
    transport.nextReadbackError = new Error('Soroban RPC 503 Service Unavailable');
    const service = new CredentialV2Service();
    const rpcErrView = await service.getCredentialByPublicId(unavailPublicId);
    expect(rpcErrView!.stellar?.verificationState).toBe('unavailable');
    expect(rpcErrView!.stellar?.failureKind).toBe('rpc_error');
    expect(rpcErrView!.stellar?.publicStatusLabel).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.unavailable
    );

    const rpcErrJsx = await CredentialV2PublicView({ credential: rpcErrView! });
    render(rpcErrJsx);
    expect(screen.getByTestId('public-verification-status').textContent).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.unavailable
    );

    // C. Invalid Contract Response (malformed struct, NOT Option::None) -> Unavailable (failureKind = invalid_response), distinct from absent!
    cleanup();
    transport.nextReadbackRawOverride = {
      active: true,
      value: { unexpected_shape: 'corrupted_scval' },
    };
    const invalidRespView =
      await service.getCredentialByPublicId(unavailPublicId);
    expect(invalidRespView!.stellar?.verificationState).toBe('unavailable');
    expect(invalidRespView!.stellar?.failureKind).toBe('invalid_response');
    expect(invalidRespView!.stellar?.publicStatusLabel).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.unavailable
    );

    // D. Controlled DEV synthetic ?demo=unavailable leaves normal requests working!
    cleanup();
    const demoUnavailableJsx = await CredentialV2PublicPage({
      params: Promise.resolve({ publicId: unavailPublicId }),
      searchParams: Promise.resolve({ demo: 'unavailable' }),
    });
    render(demoUnavailableJsx);
    expect(screen.getByTestId('public-verification-status').textContent).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.unavailable
    );

    cleanup();
    const normalStillWorksJsx = await CredentialV2PublicPage({
      params: Promise.resolve({ publicId: unavailPublicId }),
    });
    render(normalStillWorksJsx);
    expect(screen.getByTestId('public-verification-status').textContent).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.confirmed
    );
  });

  it('7. Reports Revocation ("Credencial revocada") both when exposed by the Soroban contract and when revoked locally', async () => {
    sessionCookieState.token = operatorSessionToken;

    // A. On-chain contract revocation (`revoked: true` in CredentialRecord while local row is still `issued`)
    const chainRevIssued = await issueParticipantCredentialV2FromOrganizer({
      participationId: partRevokedChainId,
      issuerEntityId: issuerId,
      subjectEntityId: subjectId,
      eventEntityId: eventRevokedChainId,
    });
    const chainRevPublicId = chainRevIssued.credential.publicId;
    createdPublicIds.push(chainRevPublicId);

    transport.revokeCredentialByHexForTest(
      computeV2CredentialIdHex(chainRevPublicId)
    );

    // B. Local application revocation via revokeCredentialV2
    const localRevIssued = await issueParticipantCredentialV2FromOrganizer({
      participationId: partRevokedLocalId,
      issuerEntityId: issuerId,
      subjectEntityId: subjectId,
      eventEntityId: eventRevokedLocalId,
    });
    const localRevPublicId = localRevIssued.credential.publicId;
    createdPublicIds.push(localRevPublicId);
    await revokeCredentialV2(localRevPublicId);

    sessionCookieState.token = null;

    const service = new CredentialV2Service();
    const chainRevView = await service.getCredentialByPublicId(chainRevPublicId);
    expect(chainRevView!.stellar?.verificationState).toBe('revoked');
    expect(chainRevView!.stellar?.revokedOnChain).toBe(true);
    expect(chainRevView!.stellar?.publicStatusLabel).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.revoked
    );

    const chainRevJsx = await CredentialV2PublicPage({
      params: Promise.resolve({ publicId: chainRevPublicId }),
    });
    render(chainRevJsx);
    expect(screen.getByTestId('public-verification-status').textContent).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.revoked
    );

    cleanup();
    const localRevJsx = await CredentialV2PublicPage({
      params: Promise.resolve({ publicId: localRevPublicId }),
    });
    render(localRevJsx);
    expect(screen.getByTestId('public-verification-status').textContent).toBe(
      SOW_PUBLIC_VERIFICATION_LABELS.revoked
    );

    // Recompute check: payload digest of revoked credential was preserved immutably
    expect(
      computePayloadDigestV2(localRevIssued.credential.canonicalPayload)
    ).toBe(localRevIssued.credential.payloadDigest);
  });
});
