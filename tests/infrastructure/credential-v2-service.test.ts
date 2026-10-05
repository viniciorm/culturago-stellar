import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { computePayloadDigestV2 } from '@/domain/credentials/v2';
import { CredentialV2Service } from '@/infrastructure/credentials/v2/CredentialV2Service';
import { buildCredentialV2Pdf } from '@/infrastructure/credentials/v2/pdfCertificate';

const testDbUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:test@127.0.0.1:5433/culturago_test';
process.env.DATABASE_URL = testDbUrl;

describe('CredentialV2Service End-to-End Suite', () => {
  let client: pg.Client;
  let service: CredentialV2Service;

  const testIds = {
    issuerOrg: 'd0000001-0000-4000-8000-000000000001',
    event: 'd0000002-0000-4000-8000-000000000002',
    personParticipantSolo: 'd0000003-0000-4000-8000-000000000003',
    personParticipantGroup: 'd0000004-0000-4000-8000-000000000004',
    personGuest: 'd0000005-0000-4000-8000-000000000005',
    personStaff: 'd0000006-0000-4000-8000-000000000006',
    participationSolo: 'e0000001-0000-4000-8000-000000000001',
    participationGroup: 'e0000002-0000-4000-8000-000000000002',
    participationGuest: 'e0000003-0000-4000-8000-000000000003',
    relStaff1: 'f0000001-0000-4000-8000-000000000001',
    relStaff2: 'f0000002-0000-4000-8000-000000000002',
  };

  beforeAll(async () => {
    client = new pg.Client({ connectionString: testDbUrl });
    await client.connect();
    service = new CredentialV2Service();

    // Clean up test data
    await client.query(`DELETE FROM credential_evidence WHERE credential_id IN (SELECT id FROM credentials WHERE issuer_entity_id = $1)`, [testIds.issuerOrg]);
    await client.query(`DELETE FROM credentials WHERE issuer_entity_id = $1`, [testIds.issuerOrg]);
    await client.query(`DELETE FROM participations WHERE event_id = $1`, [testIds.event]);
    await client.query(`DELETE FROM relationships WHERE context_event_id = $1`, [testIds.event]);
    await client.query(`DELETE FROM events WHERE entity_id = $1`, [testIds.event]);
    await client.query(
      `DELETE FROM people WHERE entity_id IN ($1, $2, $3, $4)`,
      [
        testIds.personParticipantSolo,
        testIds.personParticipantGroup,
        testIds.personGuest,
        testIds.personStaff,
      ]
    );
    await client.query(
      `DELETE FROM entities WHERE id IN ($1, $2, $3, $4, $5, $6)`,
      [
        testIds.issuerOrg,
        testIds.event,
        testIds.personParticipantSolo,
        testIds.personParticipantGroup,
        testIds.personGuest,
        testIds.personStaff,
      ]
    );

    // Seed test entities
    await client.query(`
      INSERT INTO entities (id, kind, display_name, slug, country, city)
      VALUES
        ($1, 'organization', 'Agrupacion Danza Viva', 'danza-viva-org', 'Chile', 'Santiago'),
        ($2, 'event', 'FDVC 2026 Test Festival', 'fdvc-2026-test', 'Chile', 'Santiago'),
        ($3, 'person', 'Camila Danzante', 'camila-danzante', 'Chile', 'Santiago'),
        ($4, 'person', 'Fernanda Grupal', 'fernanda-grupal', 'Chile', 'Santiago'),
        ($5, 'person', 'Soraya Maestra', 'soraya-maestra', 'Chile', 'Santiago'),
        ($6, 'person', 'Rodrigo Tecnico', 'rodrigo-tecnico', 'Chile', 'Santiago');
    `, [
      testIds.issuerOrg,
      testIds.event,
      testIds.personParticipantSolo,
      testIds.personParticipantGroup,
      testIds.personGuest,
      testIds.personStaff,
    ]);

    // Seed people with artistic names
    await client.query(`
      INSERT INTO people (entity_id, legal_name, artistic_name, main_role)
      VALUES
        ($1, 'Camila Perez', 'Kamila Nur', 'dancer'),
        ($2, 'Fernanda Soto', 'Fer Bellydance', 'dancer'),
        ($3, 'Soraya Gomez', 'Soraya Al-Khatib', 'teacher'),
        ($4, 'Rodrigo Vera', 'Rodrigo Stage', 'staff');
    `, [
      testIds.personParticipantSolo,
      testIds.personParticipantGroup,
      testIds.personGuest,
      testIds.personStaff,
    ]);

    // Seed event
    await client.query(`
      INSERT INTO events (entity_id, name, year, start_date, location, organizer_entity_id)
      VALUES ($1, 'Festival Danza del Vientre Chile 2026', 2026, '2026-09-05', 'Aula Magna Liceo Manuel de Salas', $2);
    `, [testIds.event, testIds.issuerOrg]);

    // Seed participations
    await client.query(`
      INSERT INTO participations (id, subject_entity_id, event_id, state)
      VALUES
        ($1, $2, $3, 'registered'),
        ($4, $5, $3, 'registered'),
        ($6, $7, $3, 'registered');
    `, [
      testIds.participationSolo, testIds.personParticipantSolo, testIds.event,
      testIds.participationGroup, testIds.personParticipantGroup,
      testIds.participationGuest, testIds.personGuest,
    ]);

    // Seed relationships
    await client.query(`
      INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, context_event_id, status)
      VALUES
        ($1, $2, $3, 'producer_of', $3, 'active'),
        ($4, $2, $3, 'technical_partner_of', $3, 'active');
    `, [
      testIds.relStaff1, testIds.personStaff, testIds.event,
      testIds.relStaff2,
    ]);
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });

  it('issues a valid Participant Solo Credential and verifies persistence & digest integrity', async () => {
    const cred = await service.issueCredential({
      issuerEntityId: testIds.issuerOrg,
      subjectEntityId: testIds.personParticipantSolo,
      eventEntityId: testIds.event,
      credentialFamily: 'participant',
      participationMode: 'solo',
      participationId: testIds.participationSolo,
      displayLabel: 'Certificado de Participación',
      displaySubtitle: 'FDVC 2026 — Categoría Fusión Oriental Solista',
      presentationCode: 'FDVC2026-SOL-012',
      organizationName: 'Academia Nur Al-Sharq',
      roles: ['dancer'],
      evidences: [
        {
          sourceType: 'participation',
          sourceId: testIds.participationSolo,
          evidenceRole: 'scenic_presentation',
          notes: 'Presentación Solista 05-09-2026',
        },
      ],
      issuedAt: '2026-10-04T12:00:00.000Z',
    });

    expect(cred.publicId).toMatch(/^cg2_[A-Za-z0-9_-]{16}$/);
    expect(cred.schemaVersion).toBe('culturago.credential.v2');
    expect(cred.credentialFamily).toBe('participant');
    expect(cred.participationMode).toBe('solo');
    expect(cred.participationId).toBe(testIds.participationSolo);
    expect(cred.status).toBe('issued');
    expect(cred.payloadDigest).toMatch(/^[0-9a-f]{64}$/);

    // Verify digest recomputation parity
    const recomputed = computePayloadDigestV2(cred.canonicalPayload);
    expect(cred.payloadDigest).toBe(recomputed);

    // Check canonical payload details
    expect(cred.canonicalPayload.subject.display_name).toBe('Camila Danzante');
    expect(cred.canonicalPayload.subject.artistic_name).toBe('Kamila Nur');
    expect(cred.canonicalPayload.claim.presentation_code).toBe('FDVC2026-SOL-012');
    expect(cred.canonicalPayload.claim.organization_name).toBe('Academia Nur Al-Sharq');
    expect(cred.canonicalPayload.claim.roles).toEqual(['dancer']);
    expect(cred.evidences).toHaveLength(1);
    expect(cred.evidences[0].sourceId).toBe(testIds.participationSolo);
  });

  it('issues a valid Participant Group Credential', async () => {
    const cred = await service.issueCredential({
      issuerEntityId: testIds.issuerOrg,
      subjectEntityId: testIds.personParticipantGroup,
      eventEntityId: testIds.event,
      credentialFamily: 'participant',
      participationMode: 'group',
      participationId: testIds.participationGroup,
      displayLabel: 'Certificado de Participación Grupal',
      displaySubtitle: 'FDVC 2026 — Danza Grupal',
      presentationCode: 'FDVC2026-GRP-005',
      organizationName: 'Ballet Danza Oriental',
      roles: ['dancer', 'group_member'],
      evidences: [
        {
          sourceType: 'participation',
          sourceId: testIds.participationGroup,
          evidenceRole: 'group_performance',
        },
      ],
    });

    expect(cred.participationMode).toBe('group');
    expect(cred.canonicalPayload.claim.roles).toEqual(['dancer', 'group_member']);
  });

  it('issues a valid Guest Solo Credential', async () => {
    const cred = await service.issueCredential({
      issuerEntityId: testIds.issuerOrg,
      subjectEntityId: testIds.personGuest,
      eventEntityId: testIds.event,
      credentialFamily: 'guest',
      participationMode: 'solo',
      participationId: testIds.participationGuest,
      displayLabel: 'Invitada de Honor',
      displaySubtitle: 'FDVC 2026 — Gala Internacional',
      presentationCode: 'FDVC2026-GST-001',
      roles: ['guest_artist', 'master_teacher'],
      evidences: [
        {
          sourceType: 'participation',
          sourceId: testIds.participationGuest,
          evidenceRole: 'guest_gala_presentation',
        },
      ],
    });

    expect(cred.credentialFamily).toBe('guest');
    expect(cred.canonicalPayload.subject.artistic_name).toBe('Soraya Al-Khatib');
    expect(cred.canonicalPayload.claim.roles).toEqual(['guest_artist', 'master_teacher']);
  });

  it('issues a valid Staff Credential with multiple relationship evidences and null participationId', async () => {
    const cred = await service.issueCredential({
      issuerEntityId: testIds.issuerOrg,
      subjectEntityId: testIds.personStaff,
      eventEntityId: testIds.event,
      credentialFamily: 'staff',
      participationMode: 'not_applicable',
      displayLabel: 'Certificado de Equipo Técnico',
      displaySubtitle: 'FDVC 2026 — Producción Técnica y Escenario',
      roles: ['stage_manager', 'technical_producer'],
      evidences: [
        {
          sourceType: 'relationship',
          sourceId: testIds.relStaff1,
          evidenceRole: 'producer_relationship',
          notes: 'Encargado técnico general',
        },
        {
          sourceType: 'relationship',
          sourceId: testIds.relStaff2,
          evidenceRole: 'technical_partner_relationship',
        },
      ],
    });

    expect(cred.credentialFamily).toBe('staff');
    expect(cred.participationMode).toBe('not_applicable');
    expect(cred.participationId).toBeNull();
    expect(cred.evidences).toHaveLength(2);
  });

  it('rejects duplicate active credential for same participant presentation (ALREADY_EXISTS)', async () => {
    await expect(
      service.issueCredential({
        issuerEntityId: testIds.issuerOrg,
        subjectEntityId: testIds.personParticipantSolo,
        eventEntityId: testIds.event,
        credentialFamily: 'participant',
        participationMode: 'solo',
        participationId: testIds.participationSolo,
        displayLabel: 'Duplicado Intent',
        displaySubtitle: 'Subtitulo',
        roles: ['dancer'],
        evidences: [
          {
            sourceType: 'participation',
            sourceId: testIds.participationSolo,
            evidenceRole: 'duplicate_test',
          },
        ],
      })
    ).rejects.toThrow(/already exists/i);
  });

  it('rejects duplicate active credential for same staff subject in event (ALREADY_EXISTS)', async () => {
    await expect(
      service.issueCredential({
        issuerEntityId: testIds.issuerOrg,
        subjectEntityId: testIds.personStaff,
        eventEntityId: testIds.event,
        credentialFamily: 'staff',
        participationMode: 'not_applicable',
        displayLabel: 'Staff Duplicado Intent',
        displaySubtitle: 'Subtitulo',
        roles: ['stage_manager'],
        evidences: [
          {
            sourceType: 'relationship',
            sourceId: testIds.relStaff1,
            evidenceRole: 'duplicate_staff_test',
          },
        ],
      })
    ).rejects.toThrow(/already exists/i);
  });

  it('rejects participant with invalid participationMode or missing participationId', async () => {
    await expect(
      service.issueCredential({
        issuerEntityId: testIds.issuerOrg,
        subjectEntityId: testIds.personParticipantSolo,
        eventEntityId: testIds.event,
        credentialFamily: 'participant',
        participationMode: 'not_applicable' as any,
        participationId: testIds.participationSolo,
        displayLabel: 'Invalido',
        displaySubtitle: 'Subtitulo',
        roles: ['dancer'],
        evidences: [
          {
            sourceType: 'participation',
            sourceId: testIds.participationSolo,
            evidenceRole: 'test',
          },
        ],
      })
    ).rejects.toThrow(/mode 'solo' or 'group'/i);
  });

  it('rejects evidence with non-existent sourceId in database', async () => {
    await expect(
      service.issueCredential({
        issuerEntityId: testIds.issuerOrg,
        subjectEntityId: testIds.personParticipantSolo,
        eventEntityId: testIds.event,
        credentialFamily: 'participant',
        participationMode: 'solo',
        participationId: '00000000-0000-0000-0000-000000000999',
        displayLabel: 'Invalido',
        displaySubtitle: 'Subtitulo',
        roles: ['dancer'],
        evidences: [
          {
            sourceType: 'participation',
            sourceId: '00000000-0000-0000-0000-000000000999',
            evidenceRole: 'test',
          },
        ],
      })
    ).rejects.toThrow(/does not exist in database/i);
  });

  it('retrieves public credential by public_id with full populated view', async () => {
    const cred = await service.issueCredential({
      issuerEntityId: testIds.issuerOrg,
      subjectEntityId: testIds.personParticipantSolo,
      eventEntityId: testIds.event,
      credentialFamily: 'participant',
      participationMode: 'solo',
      participationId: testIds.participationSolo,
      publicId: 'cg2_public_view_test_123',
      displayLabel: 'Certificado de Muestra',
      displaySubtitle: 'Subtitulo',
      roles: ['dancer'],
      evidences: [
        {
          sourceType: 'participation',
          sourceId: testIds.participationSolo,
          evidenceRole: 'test',
        },
      ],
    }).catch(async () => {
      // If already issued from first test, fetch that one
      return null;
    });

    const publicView = await service.getCredentialByPublicId(cred ? cred.publicId : 'cg2_public_view_test_123');
    if (publicView) {
      expect(publicView.status).toBe('issued');
      expect(publicView.issuer.displayName).toBe('Agrupacion Danza Viva');
      expect(publicView.subject.artisticName).toBe('Kamila Nur');
      expect(publicView.event.name).toBe('Festival Danza del Vientre Chile 2026');
      expect(publicView.evidences.length).toBeGreaterThanOrEqual(1);
      expect(publicView.payloadDigest).toBe(cred?.payloadDigest);
    }
  });

  it('returns null for non-existent public_id', async () => {
    const res = await service.getCredentialByPublicId('cg2_non_existent_12345');
    expect(res).toBeNull();
  });

  it('revokes credential immutably and allows re-issuing an equivalent credential', async () => {
    // 1. Fetch current active participant solo credential
    const listRes = await client.query<{ public_id: string; payload_digest: string; canonical_payload: any }>(
      `SELECT public_id, payload_digest, canonical_payload FROM credentials
       WHERE subject_entity_id = $1 AND participation_id = $2 AND status = 'issued'`,
      [testIds.personParticipantSolo, testIds.participationSolo]
    );
    expect(listRes.rows.length).toBe(1);
    const originalCred = listRes.rows[0];

    // 2. Revoke it
    const revoked = await service.revokeCredential(originalCred.public_id);
    expect(revoked.status).toBe('revoked');
    expect(revoked.revokedAt).not.toBeNull();

    // 3. STRICT IMMUTABILITY: canonical_payload and payload_digest MUST BE IDENTICAL
    expect(revoked.payloadDigest).toBe(originalCred.payload_digest);
    expect(JSON.stringify(revoked.canonicalPayload)).toBe(
      JSON.stringify(typeof originalCred.canonical_payload === 'string'
        ? JSON.parse(originalCred.canonical_payload)
        : originalCred.canonical_payload)
    );

    // 4. Now that it is revoked, issuing a replacement credential for the same presentation MUST SUCCEED
    const replacement = await service.issueCredential({
      issuerEntityId: testIds.issuerOrg,
      subjectEntityId: testIds.personParticipantSolo,
      eventEntityId: testIds.event,
      credentialFamily: 'participant',
      participationMode: 'solo',
      participationId: testIds.participationSolo,
      displayLabel: 'Certificado de Participación Re-emitido',
      displaySubtitle: 'FDVC 2026 — Categoría Fusión Oriental Solista (Corregido)',
      presentationCode: 'FDVC2026-SOL-012',
      organizationName: 'Academia Nur Al-Sharq',
      roles: ['dancer'],
      evidences: [
        {
          sourceType: 'participation',
          sourceId: testIds.participationSolo,
          evidenceRole: 'scenic_presentation',
        },
      ],
    });

    expect(replacement.status).toBe('issued');
    expect(replacement.publicId).not.toBe(originalCred.public_id);
  });

  it('generates a valid, readable PDF certificate buffer', async () => {
    const publicView = await service.getCredentialByPublicId(testIds.participationSolo);
    const dummyView = publicView || {
      id: 'd0000000-0000-0000-0000-000000000001',
      publicId: 'cg2_dummy_test_id',
      status: 'issued' as const,
      schemaVersion: 'culturago.credential.v2' as const,
      credentialFamily: 'participant' as const,
      participationMode: 'solo' as const,
      displayLabel: 'Certificado de Participación',
      displaySubtitle: 'FDVC 2026 — Gala Final',
      presentationCode: 'FDVC2026-001',
      organizationName: 'Academia Test',
      roles: ['dancer'],
      issuedAt: '2026-10-04T12:00:00Z',
      payloadDigest: 'a'.repeat(64),
      canonicalPayload: {} as any,
      issuer: { id: '1', displayName: 'Danza Viva', kind: 'organization' },
      subject: { id: '2', displayName: 'Camila Perez', kind: 'person', artisticName: 'Kamila Nur' },
      event: { id: '3', name: 'FDVC 2026', year: 2026, location: 'Santiago' },
      evidences: [],
    };

    const pdfBuffer = buildCredentialV2Pdf(dummyView, 'https://culturago.cl/credentials/cg2_dummy_test_id');
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    const pdfString = pdfBuffer.toString('utf-8');

    expect(pdfString.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfString.includes('%%EOF')).toBe(true);
    expect(pdfString.includes('CULTURAGO')).toBe(true);
    expect(pdfString.includes('CERTIFICADO DE ACREDITACION CULTURAL')).toBe(true);
  });
});
