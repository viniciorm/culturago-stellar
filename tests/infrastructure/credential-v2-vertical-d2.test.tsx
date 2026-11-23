// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { PostgreSQLIdentityStore } from '@/infrastructure/auth/PostgreSQLIdentityStore';
import { SessionService } from '@/infrastructure/auth/SessionService';
import {
  issueCredentialV2,
  issueParticipantCredentialV2FromOrganizer,
  listConfirmedParticipationsForOperator,
} from '@/app/organizer/credential-v2-actions';
import { getPublicCredentialsBySubjectId } from '@/app/actions';
import { closePool, query } from '@/infrastructure/database/pool';
import { InMemoryChainTransport } from '@/infrastructure/stellar/InMemoryChainTransport';
import { DEMO_CONFIG, MockSigner } from '@/infrastructure/stellar/MockStellarGateway';
import { PostgreSQLOperationStore } from '@/infrastructure/stellar/PostgreSQLOperationStore';
import { SorobanStellarGateway } from '@/infrastructure/stellar/SorobanStellarGateway';
import {
  SorobanCredentialV2Gateway,
  setCredentialV2GatewayOverrideForTests,
} from '@/infrastructure/credentials/v2/SorobanCredentialV2Gateway';
import { compareDigests32ByteForByte } from '@/domain/credentials/v2';
import OrganizerPanel from '@/app/organizer/page';
import PersonPublicPassportPage from '@/app/p/[slug]/page';
import CredentialV2PublicPage from '@/app/credentials/[publicId]/page';
import { GET as getV2Pdf } from '@/app/api/credentials/[publicId]/pdf/route';
import { GET as getV2Qr } from '@/app/api/credentials/[publicId]/qr/route';
import {
  assertIsolatedTestDatabase,
  validateTestDatabaseUrl,
} from '../fixtures/assertIsolatedTestDatabase';

const testDbUrl =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres:test@127.0.0.1:5433/culturago_test';
validateTestDatabaseUrl(testDbUrl);
process.env.DATABASE_URL = testDbUrl;
process.env.NEXT_PUBLIC_CULTURAGO_ENV = 'testnet';
process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
process.env.NEXT_PUBLIC_STELLAR_RPC_URL = 'https://soroban-testnet.stellar.org';
process.env.WEBAUTHN_RP_ID = 'localhost';
process.env.WEBAUTHN_ORIGINS = 'http://localhost:3000';

const D2_CONTRACT_ID = 'CBJKJVMLTOMSSSEK6YIF6K4PO2LNABDZH3ZQZGD5D4TC62YRWEXX6YSZ';
const D2_OPERATOR_ADDRESS = 'GDJPB3XTOQD4SOPJL7KYYF4TT3VYGETU74UYTCXWEK3HRITEB3B3IXAN';

const sessionCookieState = vi.hoisted(() => ({
  token: null as string | null,
}));

const navMocks = vi.hoisted(() => ({
  slug: '',
  push: vi.fn(),
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
  useParams: () => ({ slug: navMocks.slug }),
  useRouter: () => ({ push: navMocks.push }),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('qrcode', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  return {
    ...actual,
    default: {
      ...(actual.default ?? actual),
      toDataURL: vi.fn().mockResolvedValue(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
      ),
    },
  };
});

describe('D2 Vertical: Soroban V2 Anchoring from /organizer, 32-Byte Digest Readback, Retry Without Duplication & Historical Compatibility', () => {
  const issuerId = randomUUID();
  const otherIssuerId = randomUUID();
  const event1Id = randomUUID();
  const event2Id = randomUUID();
  const event3Id = randomUUID();
  const eventHistId = randomUUID();
  const orphanEventId = randomUUID();
  const subjectId = randomUUID();

  const participation1Id = randomUUID(); // Normal D2 confirmed flow
  const participation2Id = randomUUID(); // Digest readback mismatch negative test
  const participation3Id = randomUUID(); // Uncertain submission -> status query -> retry without duplicate
  const participationHistId = randomUUID(); // Historical D1 unconfirmed credential
  const participationOrphanId = randomUUID(); // Orphan event without organizer

  const authorizedAccountId = randomUUID();
  const unscopedOperatorAccountId = randomUUID();

  const issuerSlug = `org-d2-${issuerId.slice(0, 8)}`;
  const otherIssuerSlug = `org-d2-other-${otherIssuerId.slice(0, 8)}`;
  const event1Slug = `evt-d2-1-${event1Id.slice(0, 8)}`;
  const event2Slug = `evt-d2-2-${event2Id.slice(0, 8)}`;
  const event3Slug = `evt-d2-3-${event3Id.slice(0, 8)}`;
  const eventHistSlug = `evt-d2-hist-${eventHistId.slice(0, 8)}`;
  const orphanEventSlug = `evt-d2-orphan-${orphanEventId.slice(0, 8)}`;
  const subjectSlug = `solista-d2-${subjectId.slice(0, 8)}`;

  let authorizedSessionToken: string;
  let unscopedOperatorSessionToken: string;
  let historicalPublicId: string;
  let historicalDigest: string;
  let transport: InMemoryChainTransport;
  let pgOperationStore: PostgreSQLOperationStore;
  const createdCredentialIds: string[] = [];
  const createdPublicIds: string[] = [];
  let dbGuardVerified = false;

  beforeAll(async () => {
    await assertIsolatedTestDatabase(testDbUrl, query);
    dbGuardVerified = true;
    process.env.NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID = D2_CONTRACT_ID;

    const identityStore = new PostgreSQLIdentityStore();
    const sessionService = new SessionService(identityStore);

    await query(
      `INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active)
       VALUES
         ($1, 'organization', 'Agrupación Emisora Sintética D2', $2, 'Chile', 'Santiago', 'verified', true, true),
         ($3, 'organization', 'Emisor Ajeno D2', $4, 'Chile', 'Valparaíso', 'verified', true, true),
         ($5, 'event', 'Festival Sintético D2 Anclaje 2026', $6, 'Chile', 'Santiago', 'verified', true, true),
         ($7, 'event', 'Gala Sintética D2 Mismatch 2026', $8, 'Chile', 'Santiago', 'verified', true, true),
         ($9, 'event', 'Encuentro Sintético D2 Reintento 2026', $10, 'Chile', 'Ñuñoa', 'verified', true, true),
         ($11, 'event', 'Festival Histórico D1 Sintético 2026', $12, 'Chile', 'Santiago', 'verified', true, true),
         ($13, 'event', 'Evento Huérfano D2 2026', $14, 'Chile', 'Concepción', 'verified', true, true),
         ($15, 'person', 'Valeria Solista Sintética D2', $16, 'Chile', 'Santiago', 'verified', true, true)`,
      [
        issuerId,
        issuerSlug,
        otherIssuerId,
        otherIssuerSlug,
        event1Id,
        event1Slug,
        event2Id,
        event2Slug,
        event3Id,
        event3Slug,
        eventHistId,
        eventHistSlug,
        orphanEventId,
        orphanEventSlug,
        subjectId,
        subjectSlug,
      ]
    );

    await query(
      `INSERT INTO people (entity_id, legal_name, artistic_name, main_role)
       VALUES ($1, 'Valeria Legal Sintética', 'Valeria Shams', 'dancer')`,
      [subjectId]
    );

    await query(
      `INSERT INTO events (entity_id, name, year, start_date, end_date, location, organizer_entity_id)
       VALUES
         ($1, 'Festival Sintético D2 Anclaje 2026', 2026, '2026-11-23', '2026-11-24', 'Santiago', $6),
         ($2, 'Gala Sintética D2 Mismatch 2026', 2026, '2026-11-25', '2026-11-26', 'Santiago', $6),
         ($3, 'Encuentro Sintético D2 Reintento 2026', 2026, '2026-11-27', '2026-11-28', 'Ñuñoa', $6),
         ($4, 'Festival Histórico D1 Sintético 2026', 2026, '2026-11-16', '2026-11-18', 'Santiago', $6),
         ($5, 'Evento Huérfano D2 2026', 2026, '2026-12-01', '2026-12-02', 'Concepción', NULL)`,
      [event1Id, event2Id, event3Id, eventHistId, orphanEventId, issuerId]
    );

    await query(
      `INSERT INTO participations (id, subject_entity_id, event_id, state, presentation_code)
       VALUES
         ($1, $6, $7, 'participation_confirmed', 'D2-SINT-001'),
         ($2, $6, $8, 'participation_confirmed', 'D2-SINT-002'),
         ($3, $6, $9, 'participation_confirmed', 'D2-SINT-003'),
         ($4, $6, $10, 'participation_confirmed', 'D1-HIST-001'),
         ($5, $6, $11, 'participation_confirmed', 'D2-ORPHAN-001')`,
      [
        participation1Id,
        participation2Id,
        participation3Id,
        participationHistId,
        participationOrphanId,
        subjectId,
        event1Id,
        event2Id,
        event3Id,
        eventHistId,
        orphanEventId,
      ]
    );

    await identityStore.createAccount({
      id: authorizedAccountId,
      status: 'active',
      personEntityId: null,
      walletContractAddress: 'CD2SIMULATEDWALLET00000000000000000000000000000000000001',
    });
    await identityStore.grantRole(authorizedAccountId, 'operator');
    await identityStore.linkIssuerOperator(issuerId, authorizedAccountId);
    authorizedSessionToken = (await sessionService.create(authorizedAccountId)).sessionToken;

    await identityStore.createAccount({
      id: unscopedOperatorAccountId,
      status: 'active',
      personEntityId: null,
      walletContractAddress: 'CD2SIMULATEDWALLET00000000000000000000000000000000000002',
    });
    await identityStore.grantRole(unscopedOperatorAccountId, 'operator');
    await identityStore.linkIssuerOperator(otherIssuerId, unscopedOperatorAccountId);
    unscopedOperatorSessionToken = (await sessionService.create(unscopedOperatorAccountId)).sessionToken;

    // Issue historical off-chain D1 credential (no Stellar operation, issued_ledger = NULL)
    sessionCookieState.token = authorizedSessionToken;
    const histCred = await issueCredentialV2({
      issuerEntityId: issuerId,
      subjectEntityId: subjectId,
      eventEntityId: eventHistId,
      credentialFamily: 'participant',
      participationMode: 'solo',
      participationId: participationHistId,
      displayLabel: 'Participante',
      displaySubtitle: 'Solista',
      presentationCode: 'D1-HIST-001',
      organizationName: 'Agrupación Emisora Sintética D2',
      roles: ['dancer'],
      evidences: [
        {
          sourceType: 'participation',
          sourceId: participationHistId,
          evidenceRole: 'confirmed_solo_performance',
        },
      ],
    });
    historicalPublicId = histCred.publicId;
    historicalDigest = histCred.payloadDigest;
    createdCredentialIds.push(histCred.id);
    createdPublicIds.push(histCred.publicId);
  });

  afterAll(async () => {
    setCredentialV2GatewayOverrideForTests(null);
    if (dbGuardVerified) {
      if (createdPublicIds.length > 0) {
        const idempotencyKeys = createdPublicIds.map((pid) => `issue_v2:${pid}`);
        await query(`DELETE FROM stellar_operations WHERE idempotency_key = ANY($1::text[])`, [
          idempotencyKeys,
        ]);
      }
      const allCredsRes = await query<{ id: string; public_id: string }>(
        `SELECT id, public_id FROM credentials WHERE issuer_entity_id = ANY($1::uuid[])`,
        [[issuerId, otherIssuerId]]
      );
      const credIds = allCredsRes.rows.map((r) => r.id);
      const pubIds = allCredsRes.rows.map((r) => `issue_v2:${r.public_id}`);
      if (pubIds.length > 0) {
        await query(`DELETE FROM stellar_operations WHERE idempotency_key = ANY($1::text[])`, [
          pubIds,
        ]);
      }
      if (credIds.length > 0) {
        await query(`DELETE FROM credential_evidence WHERE credential_id = ANY($1::uuid[])`, [
          credIds,
        ]);
        await query(`DELETE FROM credentials WHERE id = ANY($1::uuid[])`, [credIds]);
      }

      const accountIds = [authorizedAccountId, unscopedOperatorAccountId];
      await query(`DELETE FROM sessions WHERE account_id = ANY($1::uuid[])`, [accountIds]);
      await query(`DELETE FROM issuer_operators WHERE operator_account_id = ANY($1::uuid[])`, [
        accountIds,
      ]);
      await query(`DELETE FROM account_roles WHERE account_id = ANY($1::uuid[])`, [accountIds]);
      await query(`DELETE FROM accounts WHERE id = ANY($1::uuid[])`, [accountIds]);

      await query(`DELETE FROM participations WHERE id = ANY($1::uuid[])`, [
        [
          participation1Id,
          participation2Id,
          participation3Id,
          participationHistId,
          participationOrphanId,
        ],
      ]);
      await query(`DELETE FROM events WHERE entity_id = ANY($1::uuid[])`, [
        [event1Id, event2Id, event3Id, eventHistId, orphanEventId],
      ]);
      await query(`DELETE FROM people WHERE entity_id = $1`, [subjectId]);
      await query(`DELETE FROM entities WHERE id = ANY($1::uuid[])`, [
        [
          issuerId,
          otherIssuerId,
          event1Id,
          event2Id,
          event3Id,
          eventHistId,
          orphanEventId,
          subjectId,
        ],
      ]);
    }
    await closePool();
  });

  beforeEach(() => {
    cleanup();
    sessionCookieState.token = authorizedSessionToken;
    navMocks.push.mockReset();
    navMocks.slug = subjectSlug;

    transport = new InMemoryChainTransport();
    pgOperationStore = new PostgreSQLOperationStore();
    const stellarGateway = new SorobanStellarGateway(
      {
        ...DEMO_CONFIG,
        environment: 'testnet',
        networkPassphrase: 'Test SDF Network ; September 2015',
        credentialRegistryContractId: D2_CONTRACT_ID,
      },
      transport,
      pgOperationStore,
      new MockSigner(D2_OPERATOR_ADDRESS)
    );
    setCredentialV2GatewayOverrideForTests(
      new SorobanCredentialV2Gateway({
        gateway: stellarGateway,
        store: pgOperationStore,
        contractId: D2_CONTRACT_ID,
        network: 'testnet',
        operatorAddress: D2_OPERATOR_ADDRESS,
      })
    );
  });

  it('Criteria 1, 2, 3 & 5: issues V2 participant credential from /organizer, confirms on Soroban with ledger and byte-for-byte 32-byte digest match, and coexists with historical unconfirmed credentials', async () => {
    // Render /organizer as authenticated operator
    const organizerJsx = await OrganizerPanel({});
    render(organizerJsx);

    const selectEl = screen.getByLabelText(
      /Participación confirmada \(Familia: Participant\)/i
    ) as HTMLSelectElement;
    fireEvent.change(selectEl, { target: { value: participation1Id } });

    const submitBtn = screen.getByRole('button', {
      name: /Emitir Credencial V2 \(Participant\)/i,
    });
    fireEvent.click(submitBtn);

    const resultBox = await waitFor(() => screen.getByTestId('v2-issuance-result'));
    expect(resultBox.textContent).toContain('Confirmada en Stellar');
    expect(resultBox.textContent).toContain('Gateway Soroban V2 (soroban_v2 · red: testnet · fase: confirmed)');
    expect(resultBox.textContent).toContain(D2_CONTRACT_ID);
    expect(resultBox.textContent).toContain('Verificada (32/32 bytes)');

    const credLink = screen.getByRole('link', { name: /Ver credencial pública V2/i });
    const publicId = credLink.getAttribute('href')!.replace('/credentials/', '');
    createdPublicIds.push(publicId);

    // Check PostgreSQL persistence of issued_ledger and stellar_operations
    const dbCred = await query<{
      id: string;
      payload_digest: string;
      issued_ledger: number | null;
    }>(`SELECT id, payload_digest, issued_ledger FROM credentials WHERE public_id = $1`, [
      publicId,
    ]);
    expect(dbCred.rows).toHaveLength(1);
    expect(dbCred.rows[0].issued_ledger).toBeGreaterThan(1000);

    const dbOp = await pgOperationStore.findByIdempotencyKey(`issue_v2:${publicId}`);
    expect(dbOp).not.toBeNull();
    expect(dbOp!.state.phase).toBe('confirmed');
    expect(dbOp!.state.txHash).toMatch(/^[0-9a-f]{64}$/);
    expect(dbOp!.state.ledger).toBe(dbCred.rows[0].issued_ledger);
    expect(
      compareDigests32ByteForByte(
        dbCred.rows[0].payload_digest,
        dbOp!.intent.expected?.metadataHash
      )
    ).toBe(true);

    // Check passport projection (/p/[slug]): D2 credential is 'Confirmada en Stellar' while historical D1 credential stays 'Registro local — sin confirmación Stellar'
    cleanup();
    const projected = await getPublicCredentialsBySubjectId(subjectId);
    const d2Projected = projected.find((c) => c.public_id === publicId);
    const histProjected = projected.find((c) => c.public_id === historicalPublicId);
    expect(d2Projected?.public_status_label).toBe('Confirmada en Stellar');
    expect(d2Projected?.stellar_status).toBe('registered');
    expect(d2Projected?.stellar_tx).toBe(dbOp!.state.txHash);

    expect(histProjected?.public_status_label).toBe('Registro local — sin confirmación Stellar');
    expect(histProjected?.stellar_status).toBe('not_registered');

    // Verify historical digest and payload were not altered
    const histDb = await query<{ payload_digest: string; issued_ledger: number | null }>(
      `SELECT payload_digest, issued_ledger FROM credentials WHERE public_id = $1`,
      [historicalPublicId]
    );
    expect(histDb.rows[0].payload_digest).toBe(historicalDigest);
    expect(histDb.rows[0].issued_ledger).toBeNull();

    render(<PersonPublicPassportPage />);
    await waitFor(() => {
      expect(screen.getByText('Valeria Shams')).toBeDefined();
    });
    expect(screen.getByText('Confirmada en Stellar')).toBeDefined();
    expect(screen.getByText('Registro local — sin confirmación Stellar')).toBeDefined();

    // Check public credential page (/credentials/[publicId])
    cleanup();
    const publicPageJsx = await CredentialV2PublicPage({
      params: Promise.resolve({ publicId }),
    });
    render(publicPageJsx);
    expect(screen.getByText('Confirmada en Stellar')).toBeDefined();
    expect(screen.getByText('Anclaje Soroban Confirmado (Stellar Testnet)')).toBeDefined();
    expect(screen.getByText(dbOp!.state.txHash!)).toBeDefined();

    // Check PDF and QR routes
    const pdfRes = await getV2Pdf(
      new Request(`http://localhost:3000/api/credentials/${publicId}/pdf`),
      { params: Promise.resolve({ publicId }) }
    );
    expect(pdfRes.status).toBe(200);
    const pdfBytes = Buffer.from(await pdfRes.arrayBuffer()).toString('binary');
    expect(pdfBytes).toContain(`CONFIRMADA EN STELLAR \\(LEDGER ${dbOp!.state.ledger}\\)`);
    expect(pdfBytes).toContain(dbOp!.state.txHash!);

    const qrRes = await getV2Qr(
      new Request(`http://localhost:3000/api/credentials/${publicId}/qr`),
      { params: Promise.resolve({ publicId }) }
    );
    expect(qrRes.status).toBe(200);
  });

  it('Criterion 3 (negative): does NOT mark credential confirmed if the 32-byte digest read from the contract differs from the persisted canonical digest', async () => {
    // Force contract readback to return a 32-byte digest differing from the local payload_digest
    transport.nextReadbackCorruptMetadataHash =
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    const res = await issueParticipantCredentialV2FromOrganizer({
      participationId: participation2Id,
      issuerEntityId: issuerId,
      subjectEntityId: subjectId,
      eventEntityId: event2Id,
    });
    createdPublicIds.push(res.credential.publicId);

    expect(res.gateway.simulated).toBe(false);
    if (!res.gateway.simulated) {
      expect(res.gateway.phase).toBe('failed_terminal');
      expect(res.gateway.errorCode).toBe('READBACK_MISMATCH');
      expect(res.gateway.onChainConfirmed).toBe(false);
      expect(res.gateway.digestMatches).toBe(false);
      expect(res.gateway.ledger).toBeNull();
    }
    expect(res.publicStatusLabel).toBe('Registro local — sin confirmación Stellar');

    const dbCred = await query<{ issued_ledger: number | null }>(
      `SELECT issued_ledger FROM credentials WHERE public_id = $1`,
      [res.credential.publicId]
    );
    expect(dbCred.rows[0].issued_ledger).toBeNull();
  });

  it('Criterion 4: when submission is uncertain (PENDING -> unknown), retrying queries transaction status before re-sending and does not duplicate issuance', async () => {
    // 1. First attempt: transaction is submitted, but poll times out as PENDING -> phase = 'unknown'
    transport.nextSubmissionStaysPending = true;
    const attempt1 = await issueParticipantCredentialV2FromOrganizer({
      participationId: participation3Id,
      issuerEntityId: issuerId,
      subjectEntityId: subjectId,
      eventEntityId: event3Id,
    });
    createdPublicIds.push(attempt1.credential.publicId);

    expect(attempt1.gateway.simulated).toBe(false);
    if (attempt1.gateway.simulated) throw new Error('expected real gateway');
    expect(attempt1.gateway.phase).toBe('unknown');
    expect(attempt1.gateway.onChainConfirmed).toBe(false);
    expect(attempt1.gateway.txHash).toMatch(/^[0-9a-f]{64}$/);
    expect(attempt1.publicStatusLabel).toBe('Registro local — sin confirmación Stellar');
    expect(transport.submitCallCount).toBe(1);
    expect(transport.pollCallCount).toBe(1);

    // Verify issued_ledger is still NULL while uncertain
    const dbBefore = await query<{ issued_ledger: number | null }>(
      `SELECT issued_ledger FROM credentials WHERE public_id = $1`,
      [attempt1.credential.publicId]
    );
    expect(dbBefore.rows[0].issued_ledger).toBeNull();

    // 2. Settle the in-flight transaction on the network
    transport.settlePendingTransaction(attempt1.gateway.txHash!, 'SUCCESS');

    // 3. Operator retries issuance from /organizer for the same participation
    const attempt2 = await issueParticipantCredentialV2FromOrganizer({
      participationId: participation3Id,
      issuerEntityId: issuerId,
      subjectEntityId: subjectId,
      eventEntityId: event3Id,
    });

    expect(attempt2.credential.id).toBe(attempt1.credential.id);
    expect(attempt2.credential.publicId).toBe(attempt1.credential.publicId);
    expect(attempt2.credential.payloadDigest).toBe(attempt1.credential.payloadDigest);

    expect(attempt2.gateway.simulated).toBe(false);
    if (attempt2.gateway.simulated) throw new Error('expected real gateway');
    expect(attempt2.gateway.reconciledFromExistingOperation).toBe(true);
    expect(attempt2.gateway.operationId).toBe(attempt1.gateway.operationId);
    expect(attempt2.gateway.txHash).toBe(attempt1.gateway.txHash);
    expect(attempt2.gateway.phase).toBe('confirmed');
    expect(attempt2.gateway.onChainConfirmed).toBe(true);
    expect(attempt2.gateway.digestMatches).toBe(true);
    expect(attempt2.gateway.readbackDigest).toBe(attempt1.credential.payloadDigest);
    expect(attempt2.gateway.ledger).toBeGreaterThan(1000);
    expect(attempt2.publicStatusLabel).toBe('Confirmada en Stellar');

    // Proof that transaction status was queried (pollCallCount increased) BEFORE re-sending,
    // and submit was NOT called a second time (submitCallCount remains 1)!
    expect(transport.pollCallCount).toBe(2);
    expect(transport.submitCallCount).toBe(1);

    // Proof that neither credentials nor stellar_operations were duplicated in PostgreSQL
    const credCountRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM credentials WHERE participation_id = $1`,
      [participation3Id]
    );
    expect(Number(credCountRes.rows[0].count)).toBe(1);

    const opCountRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM stellar_operations WHERE idempotency_key = $1`,
      [`issue_v2:${attempt1.credential.publicId}`]
    );
    expect(Number(opCountRes.rows[0].count)).toBe(1);
  });

  it('Criterion 5: enforces D1 server validations (operator scope and explicit event-issuer link) before any DB or Soroban operation', async () => {
    // Operator linked only to otherIssuerId cannot issue for issuerId
    sessionCookieState.token = unscopedOperatorSessionToken;
    await expect(
      issueParticipantCredentialV2FromOrganizer({
        participationId: participation1Id,
        issuerEntityId: issuerId,
        subjectEntityId: subjectId,
        eventEntityId: event1Id,
      })
    ).rejects.toThrow(/Operator is not linked to the credential issuer/i);
    expect(transport.submitCallCount).toBe(0);

    // Authorized operator cannot issue for an event without organizer_entity_id
    sessionCookieState.token = authorizedSessionToken;
    const options = await listConfirmedParticipationsForOperator();
    expect(options.map((o) => o.participationId)).not.toContain(participationOrphanId);

    await expect(
      issueParticipantCredentialV2FromOrganizer({
        participationId: participationOrphanId,
        issuerEntityId: issuerId,
        subjectEntityId: subjectId,
        eventEntityId: orphanEventId,
      })
    ).rejects.toThrow(/not linked to issuer/i);
    expect(transport.submitCallCount).toBe(0);
  });
});
