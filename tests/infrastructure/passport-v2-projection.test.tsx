// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { createTestActor } from '@/infrastructure/auth/actorContext';
import { CredentialV2Service } from '@/infrastructure/credentials/v2/CredentialV2Service';
import { getPublicCredentialsBySubjectId } from '@/app/actions';
import { closePool, query } from '@/infrastructure/database/pool';
import PersonPublicPassportPage from '@/app/p/[slug]/page';
import CredentialV2PublicPage from '@/app/credentials/[publicId]/page';
import {
  assertIsolatedTestDatabase,
  validateTestDatabaseUrl,
} from '../fixtures/assertIsolatedTestDatabase';

const testDbUrl =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres:test@127.0.0.1:5433/culturago_test';
validateTestDatabaseUrl(testDbUrl);
process.env.DATABASE_URL = testDbUrl;

const navMocks = vi.hoisted(() => ({
  slug: '',
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: navMocks.slug }),
  useRouter: () => ({ push: navMocks.push }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    ),
  },
}));

describe('Passport V2 Public Projection & V1 Coexistence (PostgreSQL + UI)', () => {
  const issuerId = randomUUID();
  const eventId = randomUUID();
  const subject1Id = randomUUID();
  const subject2Id = randomUUID();
  const participation1Id = randomUUID();
  const participation2Id = randomUUID();
  const v1CredentialId = randomUUID();

  const issuerSlug = `org-sintetica-${issuerId.slice(0, 8)}`;
  const eventSlug = `evt-sintetico-${eventId.slice(0, 8)}`;
  const subject1Slug = `artista-sintetica-1-${subject1Id.slice(0, 8)}`;
  const subject2Slug = `artista-sintetica-2-${subject2Id.slice(0, 8)}`;
  const v1CredentialCode = `FDVC2026-V1-${v1CredentialId.slice(0, 8).toUpperCase()}`;
  const v1MetadataHash = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const privateEvidenceNote = 'Nota interna privada de auditoría — NO EXPONER EN LISTADO DE PERFIL';

  let v2Service: CredentialV2Service;
  let subject1V2Id: string;
  let subject1V2PublicId: string;
  let subject2V2Id: string;
  let subject2V2PublicId: string;
  let dbGuardVerified = false;

  const operatorActor = createTestActor({
    role: 'operator',
    issuerEntityIds: [issuerId],
  });

  beforeAll(async () => {
    // Guard: reject non-test databases BEFORE any write or delete
    await assertIsolatedTestDatabase(testDbUrl, query);
    dbGuardVerified = true;

    v2Service = new CredentialV2Service();

    // 1. Seed synthetic entities scoped strictly to this run's UUIDs
    await query(
      `INSERT INTO entities (id, kind, display_name, slug, country, city, status, is_public, active)
       VALUES
         ($1, 'organization', 'Agrupación Danza Viva Sintética', $2, 'Chile', 'Santiago', 'verified', true, true),
         ($3, 'event', 'Encuentro Sintético Danza 2026', $4, 'Chile', 'Santiago', 'verified', true, true),
         ($5, 'person', 'Camila Danzante Sintética', $6, 'Chile', 'Santiago', 'verified', true, true),
         ($7, 'person', 'Valeria Solista Sintética', $8, 'Chile', 'Valparaíso', 'verified', true, true)`,
      [
        issuerId,
        issuerSlug,
        eventId,
        eventSlug,
        subject1Id,
        subject1Slug,
        subject2Id,
        subject2Slug,
      ]
    );

    await query(
      `INSERT INTO people (entity_id, legal_name, artistic_name, email, phone, main_role)
       VALUES
         ($1, 'Camila Legal Privada', 'Kamila Nur', 'camila.privado@example.test', '+56900000001', 'dancer'),
         ($2, 'Valeria Legal Privada', 'Valeria Al-Qamar', 'valeria.privado@example.test', '+56900000002', 'dancer')`,
      [subject1Id, subject2Id]
    );

    await query(
      `INSERT INTO events (entity_id, name, year, start_date, end_date, location, organizer_entity_id)
       VALUES ($1, 'Encuentro Sintético Danza 2026', 2026, '2026-11-16', '2026-11-18', 'Santiago', $2)`,
      [eventId, issuerId]
    );

    await query(
      `INSERT INTO participations (id, subject_entity_id, event_id, state, presentation_code, registration_email, credential_delivery_email)
       VALUES
         ($1, $2, $3, 'participation_confirmed', 'SINT-2026-001', 'inscripcion1@example.test', 'entrega1@example.test'),
         ($4, $5, $3, 'participation_confirmed', 'SINT-2026-002', 'inscripcion2@example.test', 'entrega2@example.test')`,
      [participation1Id, subject1Id, eventId, participation2Id, subject2Id]
    );

    // 2. Issue V2 credential for Subject 1 (participant / solo)
    const cred1 = await v2Service.issueCredential({
      actor: operatorActor,
      issuerEntityId: issuerId,
      subjectEntityId: subject1Id,
      eventEntityId: eventId,
      credentialFamily: 'participant',
      participationMode: 'solo',
      participationId: participation1Id,
      displayLabel: 'Participante',
      displaySubtitle: 'Solista',
      presentationCode: 'SINT-2026-001',
      organizationName: 'Agrupación Danza Viva Sintética',
      roles: ['dancer'],
      evidences: [
        {
          sourceType: 'participation',
          sourceId: participation1Id,
          evidenceRole: 'confirmed_solo_performance',
          notes: privateEvidenceNote,
        },
      ],
    });
    subject1V2Id = cred1.id;
    subject1V2PublicId = cred1.publicId;

    // 3. Issue V1 legacy credential for Subject 1 to verify V1 coexistence
    await query(
      `INSERT INTO credentials (
         id, credential_code, issuer_entity_id, subject_entity_id, event_id,
         credential_type, title, description, metadata_hash, hash_schema, status, issued_intent_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         1, 'Acreditación Legacy V1', 'Participación Histórica V1', $6, 1, 'issued', NOW() - INTERVAL '1 hour'
       )`,
      [v1CredentialId, v1CredentialCode, issuerId, subject1Id, eventId, v1MetadataHash]
    );

    // 4. Issue V2 credential for Subject 2 (must NEVER appear on Subject 1's profile)
    const cred2 = await v2Service.issueCredential({
      actor: operatorActor,
      issuerEntityId: issuerId,
      subjectEntityId: subject2Id,
      eventEntityId: eventId,
      credentialFamily: 'participant',
      participationMode: 'solo',
      participationId: participation2Id,
      displayLabel: 'Participante Otra Artista',
      displaySubtitle: 'Solista Valparaíso',
      presentationCode: 'SINT-2026-002',
      roles: ['dancer'],
      evidences: [
        {
          sourceType: 'participation',
          sourceId: participation2Id,
          evidenceRole: 'confirmed_solo_performance',
        },
      ],
    });
    subject2V2Id = cred2.id;
    subject2V2PublicId = cred2.publicId;
  });

  afterAll(async () => {
    if (dbGuardVerified) {
      const credentialIds = [subject1V2Id, subject2V2Id, v1CredentialId].filter(Boolean);
      if (credentialIds.length > 0) {
        await query(
          `DELETE FROM credential_evidence WHERE credential_id = ANY($1::uuid[])`,
          [credentialIds]
        );
        await query(
          `DELETE FROM credentials WHERE id = ANY($1::uuid[])`,
          [credentialIds]
        );
      }
      await query(
        `DELETE FROM participations WHERE id = ANY($1::uuid[])`,
        [[participation1Id, participation2Id]]
      );
      await query(`DELETE FROM events WHERE entity_id = $1`, [eventId]);
      await query(
        `DELETE FROM people WHERE entity_id = ANY($1::uuid[])`,
        [[subject1Id, subject2Id]]
      );
      await query(
        `DELETE FROM entities WHERE id = ANY($1::uuid[])`,
        [[issuerId, eventId, subject1Id, subject2Id]]
      );
    }
    await closePool();
  });

  beforeEach(() => {
    cleanup();
    navMocks.push.mockReset();
    navMocks.slug = subject1Slug;
  });

  it('rejects non-test databases or remote hosts before any write or delete', async () => {
    expect(() =>
      validateTestDatabaseUrl('postgresql://postgres:secret@127.0.0.1:5432/culturago')
    ).toThrow(/must explicitly end with '_test'/i);
    expect(() =>
      validateTestDatabaseUrl('postgresql://postgres:secret@127.0.0.1:5432/culturago_prod')
    ).toThrow(/must explicitly end with '_test'/i);
    expect(() =>
      validateTestDatabaseUrl('postgresql://postgres:secret@127.0.0.1:5432/fdvc2026_test')
    ).toThrow(/never reference production\/festival data/i);
    expect(() =>
      validateTestDatabaseUrl('postgresql://postgres:secret@db.culturago.cl:5432/culturago_test')
    ).toThrow(/refusing non-local host/i);

    await expect(
      assertIsolatedTestDatabase(
        'postgresql://postgres:test@127.0.0.1:5433/culturago_test',
        async () => ({ rows: [{ db_name: 'culturago_production' } as never] })
      )
    ).rejects.toThrow(/does not match isolated test database/i);
  });

  it('projects V2 and V1 credentials for the subject with minimal public fields and excludes other subjects', async () => {
    const creds = await getPublicCredentialsBySubjectId(subject1Id);

    // Must contain Subject 1's V2 and V1 credentials, and NOT Subject 2's credential
    expect(creds).toHaveLength(2);
    const publicIds = creds.map((c) => c.public_id || c.credential_code);
    expect(publicIds).toContain(subject1V2PublicId);
    expect(publicIds).toContain(v1CredentialCode);
    expect(publicIds).not.toContain(subject2V2PublicId);

    const v2Item = creds.find((c) => c.public_id === subject1V2PublicId)!;
    expect(v2Item).toBeDefined();
    expect(v2Item.schema_version).toBe('culturago.credential.v2');
    expect(v2Item.display_label).toBe('Participante');
    expect(v2Item.display_subtitle).toBe('Solista');
    expect(v2Item.public_status_label).toBe('Registro local — sin confirmación Stellar');
    expect(v2Item.stellar_status).toBe('not_registered');
    expect(v2Item.href).toBe(`/credentials/${encodeURIComponent(subject1V2PublicId)}`);

    const v1Item = creds.find((c) => c.credential_code === v1CredentialCode)!;
    expect(v1Item).toBeDefined();
    expect(v1Item.title).toBe('Acreditación Legacy V1');
    expect(v1Item.href).toBe(`/credencial/${encodeURIComponent(v1CredentialCode)}`);

    // Criterion 4: Verify private evidence, full canonical_payload, and operational emails are NOT exposed
    const rawRecord = v2Item as unknown as Record<string, unknown>;
    expect(rawRecord.canonical_payload).toBeUndefined();
    expect(rawRecord.canonicalPayload).toBeUndefined();
    expect(rawRecord.payload_digest).toBeUndefined();
    expect(rawRecord.payloadDigest).toBeUndefined();
    expect(rawRecord.evidences).toBeUndefined();
    expect(rawRecord.participation_id).toBeUndefined();

    const serialized = JSON.stringify(creds);
    expect(serialized).not.toContain(privateEvidenceNote);
    expect(serialized).not.toContain('inscripcion1@example.test');
    expect(serialized).not.toContain('entrega1@example.test');
    expect(serialized).not.toContain('Camila Legal Privada');
  });

  it('renders V2 and V1 credentials in the public passport page and navigates to their respective routes', async () => {
    render(<PersonPublicPassportPage />);

    // Wait for passport data and credentials to load from PostgreSQL
    await waitFor(() => {
      expect(screen.getByText('Kamila Nur')).toBeDefined();
    });

    // Criterion 1 & 2: V2 label, subtitle, and local unconfirmed status are rendered
    expect(screen.getByText('Participante')).toBeDefined();
    expect(screen.getByText('Solista')).toBeDefined();
    expect(screen.getAllByText('Registro local — sin confirmación Stellar').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(subject1V2PublicId)).toBeDefined();

    // Internal status 'issued' must not be presented as blockchain confirmation
    expect(screen.queryByText('Confirmada en Stellar')).toBeNull();

    // Criterion 5: Subject 2's credential does not appear on Subject 1's passport
    expect(screen.queryByText(subject2V2PublicId)).toBeNull();
    expect(screen.queryByText('Participante Otra Artista')).toBeNull();

    // Criterion 4: Private evidence note is not rendered
    expect(screen.queryByText(privateEvidenceNote)).toBeNull();

    // Criterion 1: V2 link points to /credentials/[publicId] and navigates on click
    const v2Link = screen.getByText('Participante').closest('a');
    expect(v2Link).not.toBeNull();
    expect(v2Link?.getAttribute('href')).toBe(`/credentials/${subject1V2PublicId}`);
    fireEvent.click(v2Link!);
    expect(navMocks.push).toHaveBeenCalledWith(`/credentials/${subject1V2PublicId}`);

    // Criterion 3: V1 credential still appears with its /credencial/[credential_code] link
    const v1Link = screen.getByText('Acreditación Legacy V1').closest('a');
    expect(v1Link).not.toBeNull();
    expect(v1Link?.getAttribute('href')).toBe(`/credencial/${v1CredentialCode}`);
    fireEvent.click(v1Link!);
    expect(navMocks.push).toHaveBeenCalledWith(`/credencial/${v1CredentialCode}`);

    // Verify the destination /credentials/[publicId] page renders the V2 credential and exposes PDF/QR links
    cleanup();
    const destinationJsx = await CredentialV2PublicPage({
      params: Promise.resolve({ publicId: subject1V2PublicId }),
    });
    render(destinationJsx);

    expect(screen.getByText('Registro local — sin confirmación Stellar')).toBeDefined();
    const pdfAnchor = screen.getByText('Descargar Certificado (PDF)').closest('a');
    expect(pdfAnchor?.getAttribute('href')).toBe(`/api/credentials/${subject1V2PublicId}/pdf`);
    const qrAnchor = screen.getByText('Ver Código QR').closest('a');
    expect(qrAnchor?.getAttribute('href')).toBe(`/api/credentials/${subject1V2PublicId}/qr`);
  });
});
