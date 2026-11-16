// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { createTestActor } from '@/infrastructure/auth/actorContext';
import { PostgreSQLIdentityStore } from '@/infrastructure/auth/PostgreSQLIdentityStore';
import { SessionService } from '@/infrastructure/auth/SessionService';
import {
  issueCredentialV2,
  issueCredentialV2WithSimulatedGateway,
  issueParticipantCredentialV2FromOrganizer,
  listConfirmedParticipationsForOperator,
} from '@/app/organizer/credential-v2-actions';
import { getPublicCredentialsBySubjectId } from '@/app/actions';
import { closePool, query } from '@/infrastructure/database/pool';
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

describe('D1 Tranche 2 & Organizer UI: Session-Derived V2 Issuance, Rejections & Simulated Gateway Vertical', () => {
  const issuerId = randomUUID();
  const otherIssuerId = randomUUID();
  const eventId = randomUUID();
  const otherEventId = randomUUID();
  const subject1Id = randomUUID();
  const subject2Id = randomUUID();
  const subjectUnconfirmedId = randomUUID();

  const participationConfirmedId = randomUUID();
  const participationOtherSubjectId = randomUUID();
  const participationOtherEventId = randomUUID();
  const participationUnconfirmedId = randomUUID();

  const authorizedAccountId = randomUUID();
  const unscopedOperatorAccountId = randomUUID();
  const unscopedAdminAccountId = randomUUID();
  const visitorAccountId = randomUUID();

  const issuerSlug = `org-d1-${issuerId.slice(0, 8)}`;
  const otherIssuerSlug = `org-ajena-${otherIssuerId.slice(0, 8)}`;
  const eventSlug = `evt-d1-${eventId.slice(0, 8)}`;
  const otherEventSlug = `evt-ajeno-${otherEventId.slice(0, 8)}`;
  const subject1Slug = `solista-d1-${subject1Id.slice(0, 8)}`;
  const subject2Slug = `solista-ajena-${subject2Id.slice(0, 8)}`;
  const subjectUnconfirmedSlug = `solista-reg-${subjectUnconfirmedId.slice(0, 8)}`;

  let authorizedSessionToken: string;
  let unscopedOperatorSessionToken: string;
  let unscopedAdminSessionToken: string;
  let visitorSessionToken: string;
  let issuedCredentialId: string | null = null;
  let dbGuardVerified = false;

  beforeAll(async () => {
    await assertIsolatedTestDatabase(testDbUrl, query);
    dbGuardVerified = true;

    const identityStore = new PostgreSQLIdentityStore();
    const sessionService = new SessionService(identityStore);

    // 1. Seed synthetic entities (issuers, events, subjects)
    await query(
      `INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active)
       VALUES
         ($1, 'organization', 'Emisor Sintético D1', $2, 'Chile', 'Santiago', 'verified', true, true),
         ($3, 'organization', 'Emisor Ajeno Sintético', $4, 'Chile', 'Concepción', 'verified', true, true),
         ($5, 'event', 'Festival Sintético D1 2026', $6, 'Chile', 'Santiago', 'verified', true, true),
         ($7, 'event', 'Evento Ajeno Sintético 2026', $8, 'Chile', 'Valparaíso', 'verified', true, true),
         ($9, 'person', 'Elena Solista Sintética', $10, 'Chile', 'Santiago', 'verified', true, true),
         ($11, 'person', 'Paula Sujeto Ajeno', $12, 'Chile', 'Santiago', 'verified', true, true),
         ($13, 'person', 'Lucía Participación No Confirmada', $14, 'Chile', 'Santiago', 'verified', true, true)`,
      [
        issuerId,
        issuerSlug,
        otherIssuerId,
        otherIssuerSlug,
        eventId,
        eventSlug,
        otherEventId,
        otherEventSlug,
        subject1Id,
        subject1Slug,
        subject2Id,
        subject2Slug,
        subjectUnconfirmedId,
        subjectUnconfirmedSlug,
      ]
    );

    await query(
      `INSERT INTO people (entity_id, legal_name, artistic_name, main_role)
       VALUES
         ($1, 'Elena Legal', 'Elena Al-Noor', 'dancer'),
         ($2, 'Paula Legal', 'Paula Raks', 'dancer'),
         ($3, 'Lucía Legal', 'Lucía Mirage', 'dancer')`,
      [subject1Id, subject2Id, subjectUnconfirmedId]
    );

    await query(
      `INSERT INTO events (entity_id, name, year, start_date, end_date, location, organizer_entity_id)
       VALUES
         ($1, 'Festival Sintético D1 2026', 2026, '2026-11-16', '2026-11-18', 'Santiago', $2),
         ($3, 'Evento Ajeno Sintético 2026', 2026, '2026-12-01', '2026-12-02', 'Valparaíso', $4)`,
      [eventId, issuerId, otherEventId, otherIssuerId]
    );

    // 2. Seed participations
    await query(
      `INSERT INTO participations (id, subject_entity_id, event_id, state, presentation_code)
       VALUES
         ($1, $2, $3, 'participation_confirmed', 'D1-SINT-001'),
         ($4, $5, $3, 'participation_confirmed', 'D1-SINT-002'),
         ($6, $2, $7, 'participation_confirmed', 'D1-OTRO-001'),
         ($8, $9, $3, 'registered', 'D1-UNCONF-001')`,
      [
        participationConfirmedId,
        subject1Id,
        eventId,
        participationOtherSubjectId,
        subject2Id,
        participationOtherEventId,
        otherEventId,
        participationUnconfirmedId,
        subjectUnconfirmedId,
      ]
    );

    // 3. Seed operator/visitor accounts, roles, issuer scopes, and real sessions in PostgreSQL
    await identityStore.createAccount({
      id: authorizedAccountId,
      status: 'active',
      personEntityId: null,
      walletContractAddress: 'CD1SIMULATEDWALLET00000000000000000000000000000000000001',
    });
    await identityStore.grantRole(authorizedAccountId, 'operator');
    await identityStore.linkIssuerOperator(issuerId, authorizedAccountId);
    authorizedSessionToken = (await sessionService.create(authorizedAccountId)).sessionToken;

    await identityStore.createAccount({
      id: unscopedOperatorAccountId,
      status: 'active',
      personEntityId: null,
      walletContractAddress: 'CD1SIMULATEDWALLET00000000000000000000000000000000000002',
    });
    await identityStore.grantRole(unscopedOperatorAccountId, 'operator');
    await identityStore.linkIssuerOperator(otherIssuerId, unscopedOperatorAccountId);
    unscopedOperatorSessionToken = (await sessionService.create(unscopedOperatorAccountId)).sessionToken;

    await identityStore.createAccount({
      id: unscopedAdminAccountId,
      status: 'active',
      personEntityId: null,
      walletContractAddress: 'CD1SIMULATEDWALLET00000000000000000000000000000000000003',
    });
    await identityStore.grantRole(unscopedAdminAccountId, 'admin');
    unscopedAdminSessionToken = (await sessionService.create(unscopedAdminAccountId)).sessionToken;

    await identityStore.createAccount({
      id: visitorAccountId,
      status: 'active',
      personEntityId: null,
      walletContractAddress: null,
    });
    await identityStore.grantRole(visitorAccountId, 'visitor');
    visitorSessionToken = (await sessionService.create(visitorAccountId)).sessionToken;
  });

  afterAll(async () => {
    if (dbGuardVerified) {
      if (issuedCredentialId) {
        await query(`DELETE FROM credential_evidence WHERE credential_id = $1`, [
          issuedCredentialId,
        ]);
        await query(`DELETE FROM credentials WHERE id = $1`, [issuedCredentialId]);
      }

      const accountIds = [
        authorizedAccountId,
        unscopedOperatorAccountId,
        unscopedAdminAccountId,
        visitorAccountId,
      ];
      await query(`DELETE FROM sessions WHERE account_id = ANY($1::uuid[])`, [accountIds]);
      await query(`DELETE FROM issuer_operators WHERE operator_account_id = ANY($1::uuid[])`, [
        accountIds,
      ]);
      await query(`DELETE FROM account_roles WHERE account_id = ANY($1::uuid[])`, [accountIds]);
      await query(`DELETE FROM accounts WHERE id = ANY($1::uuid[])`, [accountIds]);

      await query(`DELETE FROM participations WHERE id = ANY($1::uuid[])`, [
        [
          participationConfirmedId,
          participationOtherSubjectId,
          participationOtherEventId,
          participationUnconfirmedId,
        ],
      ]);
      await query(`DELETE FROM events WHERE entity_id = ANY($1::uuid[])`, [
        [eventId, otherEventId],
      ]);
      await query(`DELETE FROM people WHERE entity_id = ANY($1::uuid[])`, [
        [subject1Id, subject2Id, subjectUnconfirmedId],
      ]);
      await query(`DELETE FROM entities WHERE id = ANY($1::uuid[])`, [
        [
          issuerId,
          otherIssuerId,
          eventId,
          otherEventId,
          subject1Id,
          subject2Id,
          subjectUnconfirmedId,
        ],
      ]);
    }
    await closePool();
  });

  beforeEach(() => {
    cleanup();
    sessionCookieState.token = null;
    navMocks.push.mockReset();
    navMocks.slug = subject1Slug;
  });

  it('rejects missing session, visitor role, and operators/admins without issuer scope', async () => {
    const baseInput = {
      issuerEntityId: issuerId,
      subjectEntityId: subject1Id,
      eventEntityId: eventId,
      credentialFamily: 'participant' as const,
      participationMode: 'solo' as const,
      participationId: participationConfirmedId,
      displayLabel: 'Participante',
      displaySubtitle: 'Solista',
      presentationCode: 'D1-SINT-001',
      roles: ['dancer'],
      evidences: [
        {
          sourceType: 'participation' as const,
          sourceId: participationConfirmedId,
          evidenceRole: 'confirmed_solo_performance',
        },
      ],
    };

    // 1. No session cookie -> rejected
    sessionCookieState.token = null;
    await expect(issueCredentialV2(baseInput)).rejects.toThrow(/session required/i);
    await expect(
      issueParticipantCredentialV2FromOrganizer({
        participationId: participationConfirmedId,
        issuerEntityId: issuerId,
        subjectEntityId: subject1Id,
        eventEntityId: eventId,
      })
    ).rejects.toThrow(/session required/i);

    // 2. Visitor session -> rejected
    sessionCookieState.token = visitorSessionToken;
    await expect(issueCredentialV2(baseInput)).rejects.toThrow(
      /Actor role "visitor" is not allowed here/i
    );

    // 3. Operator linked only to another issuer -> rejected even if payload spoofs actor
    sessionCookieState.token = unscopedOperatorSessionToken;
    const spoofedPayload = {
      ...baseInput,
      actor: createTestActor({ role: 'operator', issuerEntityIds: [issuerId] }),
    };
    await expect(
      issueCredentialV2WithSimulatedGateway(spoofedPayload as never)
    ).rejects.toThrow(/Operator is not linked to the credential issuer/i);
    await expect(
      issueParticipantCredentialV2FromOrganizer({
        participationId: participationConfirmedId,
        issuerEntityId: issuerId,
        subjectEntityId: subject1Id,
        eventEntityId: eventId,
      })
    ).rejects.toThrow(/Operator is not linked to the credential issuer/i);

    // 4. Global admin without explicit link to issuerId -> rejected
    sessionCookieState.token = unscopedAdminSessionToken;
    await expect(issueCredentialV2(baseInput)).rejects.toThrow(
      /Operator is not linked to the credential issuer/i
    );

    // Confirm 0 credentials were persisted
    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM credentials WHERE issuer_entity_id = $1`,
      [issuerId]
    );
    expect(Number(countRes.rows[0].count)).toBe(0);
  });

  it('rejects foreign participation evidence (other subject or event) and unconfirmed participations', async () => {
    sessionCookieState.token = authorizedSessionToken;

    // 1. Browser selection tampering: participationOtherSubjectId belongs to subject2Id, not subject1Id
    await expect(
      issueParticipantCredentialV2FromOrganizer({
        participationId: participationOtherSubjectId,
        issuerEntityId: issuerId,
        subjectEntityId: subject1Id,
        eventEntityId: eventId,
      })
    ).rejects.toThrow(/must belong to this subject\/event and be confirmed/i);

    // 2. Foreign event participation: participationOtherEventId belongs to otherEventId, not eventId
    await expect(
      issueParticipantCredentialV2FromOrganizer({
        participationId: participationOtherEventId,
        issuerEntityId: issuerId,
        subjectEntityId: subject1Id,
        eventEntityId: eventId,
      })
    ).rejects.toThrow(/must belong to this subject\/event and be confirmed/i);

    // 3. Event belonging to another issuer passed with authorized issuerId
    await expect(
      issueParticipantCredentialV2FromOrganizer({
        participationId: participationOtherEventId,
        issuerEntityId: issuerId,
        subjectEntityId: subject1Id,
        eventEntityId: otherEventId,
      })
    ).rejects.toThrow(/not linked to issuer/i);

    // 4. Unconfirmed participation ('registered' state)
    await expect(
      issueParticipantCredentialV2FromOrganizer({
        participationId: participationUnconfirmedId,
        issuerEntityId: issuerId,
        subjectEntityId: subjectUnconfirmedId,
        eventEntityId: eventId,
      })
    ).rejects.toThrow(/must belong to this subject\/event and be confirmed/i);

    // Confirm 0 credentials were persisted
    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM credentials WHERE issuer_entity_id = $1`,
      [issuerId]
    );
    expect(Number(countRes.rows[0].count)).toBe(0);
  });

  it('completes the vertical flow from /organizer UI: select confirmed participation -> issue V2 -> simulated gateway -> passport -> public page, PDF & QR', async () => {
    sessionCookieState.token = authorizedSessionToken;

    // 1. Verify listConfirmedParticipationsForOperator scopes strictly to the operator's linked issuer
    const options = await listConfirmedParticipationsForOperator();
    const optionIds = options.map((o) => o.participationId);
    expect(optionIds).toContain(participationConfirmedId);
    expect(optionIds).not.toContain(participationOtherEventId); // belongs to otherIssuerId
    expect(optionIds).not.toContain(participationUnconfirmedId); // 'registered' state

    // 2. Render /organizer page as the authenticated non-admin operator
    const organizerPageJsx = await OrganizerPanel({});
    render(organizerPageJsx);

    expect(
      screen.getByText('Emisión Credential V2 — Familia Participant')
    ).toBeDefined();
    expect(
      screen.getAllByText('Registro local — sin confirmación Stellar').length
    ).toBeGreaterThanOrEqual(1);

    // Select the confirmed participation for Subject 1 in the form
    const selectEl = screen.getByLabelText(
      /Participación confirmada \(Familia: Participant\)/i
    ) as HTMLSelectElement;
    fireEvent.change(selectEl, { target: { value: participationConfirmedId } });

    const submitBtn = screen.getByRole('button', {
      name: /Emitir Credencial V2 \(Participant\)/i,
    });
    fireEvent.click(submitBtn);

    // 3. Wait for issuance result in /organizer UI
    const resultBox = await waitFor(() =>
      screen.getByTestId('v2-issuance-result')
    );
    expect(resultBox.textContent).toContain(
      'Credencial V2 emitida: Participante (Solista)'
    );
    expect(resultBox.textContent).toContain(
      'Registro local — sin confirmación Stellar'
    );
    expect(resultBox.textContent).toContain('Gateway Simulado (simulated_d1');
    expect(resultBox.textContent).toContain(
      'este resultado es una simulación y no constituye confirmación en Stellar'
    );

    const passportLink = screen.getByRole('link', {
      name: /Ver pasaporte público/i,
    });
    expect(passportLink.getAttribute('href')).toBe(`/p/${subject1Slug}`);

    const credLink = screen.getByRole('link', {
      name: /Ver credencial pública V2/i,
    });
    const credHref = credLink.getAttribute('href')!;
    expect(credHref).toMatch(/^\/credentials\/cg2_/);
    const publicId = credHref.replace('/credentials/', '');

    const dbCredRes = await query<{ id: string }>(
      `SELECT id FROM credentials WHERE public_id = $1`,
      [publicId]
    );
    expect(dbCredRes.rows).toHaveLength(1);
    issuedCredentialId = dbCredRes.rows[0].id;

    // 4. Open public passport (/p/[slug]) and verify credential projection and navigation
    cleanup();
    const projected = await getPublicCredentialsBySubjectId(subject1Id);
    expect(projected).toHaveLength(1);
    expect(projected[0].public_id).toBe(publicId);
    expect(projected[0].public_status_label).toBe(
      'Registro local — sin confirmación Stellar'
    );

    render(<PersonPublicPassportPage />);
    await waitFor(() => {
      expect(screen.getByText('Elena Al-Noor')).toBeDefined();
    });

    expect(screen.getByText('Participante')).toBeDefined();
    expect(screen.getByText('Solista')).toBeDefined();
    expect(screen.getByText('Registro local — sin confirmación Stellar')).toBeDefined();
    expect(screen.getByText(publicId)).toBeDefined();
    expect(screen.queryByText('Confirmada en Stellar')).toBeNull();

    const cardLink = screen.getByText('Participante').closest('a');
    expect(cardLink?.getAttribute('href')).toBe(`/credentials/${publicId}`);
    fireEvent.click(cardLink!);
    expect(navMocks.push).toHaveBeenCalledWith(`/credentials/${publicId}`);

    // 5. Render reutilized public credential page (/credentials/[publicId])
    cleanup();
    const publicPageJsx = await CredentialV2PublicPage({
      params: Promise.resolve({ publicId }),
    });
    render(publicPageJsx);
    expect(screen.getByText('Registro local — sin confirmación Stellar')).toBeDefined();
    expect(screen.getAllByText(/Elena Solista Sintética/).length).toBeGreaterThanOrEqual(1);

    // 6. Verify reutilized PDF and QR API routes return valid content for the issued credential
    const pdfRes = await getV2Pdf(
      new Request(`http://localhost:3000/api/credentials/${publicId}/pdf`),
      { params: Promise.resolve({ publicId }) }
    );
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get('Content-Type')).toBe('application/pdf');
    const pdfBytes = Buffer.from(await pdfRes.arrayBuffer()).toString('binary');
    expect(pdfBytes.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfBytes).toContain(publicId);

    const qrRes = await getV2Qr(
      new Request(`http://localhost:3000/api/credentials/${publicId}/qr`),
      { params: Promise.resolve({ publicId }) }
    );
    expect(qrRes.status).toBe(200);
    expect(qrRes.headers.get('Content-Type')).toContain('image/svg+xml');
    const qrSvg = await qrRes.text();
    expect(qrSvg).toContain('<svg');
  });
});
