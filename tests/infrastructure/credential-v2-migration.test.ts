import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { validateEvidenceInput, validateCredentialV2Input } from '@/domain/credentials/v2';

const { Client } = pg;
const testDbUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:test@127.0.0.1:5433/culturago_test';

// Skip if isolated test DB is not reachable
let dbAvailable = false;

describe('Credential V2 Schema & Integrity (0014 Migration Isolated Tests)', () => {
  let client: pg.Client;

  const testIds = {
    issuerOrg: 'a0000001-0000-4000-8000-000000000001',
    event: 'a0000002-0000-4000-8000-000000000002',
    personParticipant: 'a0000003-0000-4000-8000-000000000003',
    personGuest: 'a0000004-0000-4000-8000-000000000004',
    personStaff: 'a0000005-0000-4000-8000-000000000005',
    participationSolo: 'b0000001-0000-4000-8000-000000000001',
    participationGuest: 'b0000002-0000-4000-8000-000000000002',
    relProducer: 'c0000001-0000-4000-8000-000000000001',
    relOrganizer: 'c0000002-0000-4000-8000-000000000002',
  };

  beforeAll(async () => {
    client = new Client({ connectionString: testDbUrl });
    try {
      await client.connect();
      dbAvailable = true;
    } catch {
      console.warn('Isolated test database not reachable at', testDbUrl);
      return;
    }

    // Seed base entities, event, participations and relationships in test DB
    await client.query('BEGIN');
    try {
      // 1. Entities
      await client.query(`
        INSERT INTO entities (id, kind, display_name, slug, country, city)
        VALUES
          ($1, 'organization', 'Festival Emisor Org', 'festival-emisor-org', 'Chile', 'Santiago'),
          ($2, 'event', 'Festival Test 2026', 'festival-test-2026', 'Chile', 'Santiago'),
          ($3, 'person', 'Solista Participant Test', 'solista-participant-test', 'Chile', 'Santiago'),
          ($4, 'person', 'Guest Test', 'guest-test', 'Chile', 'Santiago'),
          ($5, 'person', 'Staff Member Test', 'staff-member-test', 'Chile', 'Santiago')
        ON CONFLICT (id) DO NOTHING
      `, [testIds.issuerOrg, testIds.event, testIds.personParticipant, testIds.personGuest, testIds.personStaff]);

      // 2. Events table
      await client.query(`
        INSERT INTO events (entity_id, name, year, start_date, location, organizer_entity_id)
        VALUES ($1, 'Festival Test 2026', 2026, '2026-09-05', 'Aula Magna', $2)
        ON CONFLICT (entity_id) DO NOTHING
      `, [testIds.event, testIds.issuerOrg]);

      // 3. Participations
      await client.query(`
        INSERT INTO participations (id, subject_entity_id, event_id, state, presentation_code)
        VALUES
          ($1, $2, $3, 'registered', 'FDVC2026-TEST-001'),
          ($4, $5, $3, 'registered', 'FDVC2026-TEST-023')
        ON CONFLICT (id) DO NOTHING
      `, [
        testIds.participationSolo, testIds.personParticipant, testIds.event,
        testIds.participationGuest, testIds.personGuest,
      ]);

      // 4. Relationships (including producer_of and person -> organizer_of)
      await client.query(`
        INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, context_event_id, status)
        VALUES
          ($1, $2, $3, 'producer_of', $3, 'active'),
          ($4, $2, $3, 'organizer_of', $3, 'active')
        ON CONFLICT (id) DO NOTHING
      `, [
        testIds.relProducer, testIds.personStaff, testIds.event,
        testIds.relOrganizer,
      ]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      // Clean up test data inserted
      await client.query('DELETE FROM credential_evidence WHERE credential_id IN (SELECT id FROM credentials WHERE public_id LIKE \'test_%\')');
      await client.query('DELETE FROM credentials WHERE public_id LIKE \'test_%\' OR credential_code LIKE \'V1-TEST-%\'');
      await client.end();
    }
  });

  // ==========================================================================
  // PASO 4: TESTS V1 LEGACY COMPATIBILITY
  // ==========================================================================
  describe('Paso 4: V1 Legacy Compatibility', () => {
    it('successfully inserts legacy credential with credential_type 1..6 and NULL V2 fields', async () => {
      if (!dbAvailable) return;
      const v1Id = 'd0000001-0000-4000-8000-000000000001';
      const hash = 'a'.repeat(64);

      const res = await client.query(`
        INSERT INTO credentials (
          id, credential_code, issuer_entity_id, subject_entity_id, event_id,
          credential_type, metadata_hash, hash_schema, status
        ) VALUES (
          $1, 'V1-TEST-001', $2, $3, $4, 1, $5, 1, 'issued'
        ) RETURNING id, credential_code, public_id, schema_version, credential_family, credential_type
      `, [v1Id, testIds.issuerOrg, testIds.personParticipant, testIds.event, hash]);

      expect(res.rows[0].id).toBe(v1Id);
      expect(res.rows[0].credential_code).toBe('V1-TEST-001');
      // For new V1 inserts omitting public_id, it is NULL (preserves legacy behavior)
      expect(res.rows[0].public_id).toBeNull();
      expect(res.rows[0].schema_version).toBeNull();
      expect(res.rows[0].credential_family).toBeNull();
      expect(res.rows[0].credential_type).toBe(1);
    });

    it('preserves legacy uniqueness constraint on (issuer, subject, event, credential_type)', async () => {
      if (!dbAvailable) return;
      const v1DupId = 'd0000001-0000-4000-8000-000000000002';
      const hash = 'b'.repeat(64);

      // Attempting to insert duplicate legacy credential with same type=1 for same subject and event
      await expect(
        client.query(`
          INSERT INTO credentials (
            id, credential_code, issuer_entity_id, subject_entity_id, event_id,
            credential_type, metadata_hash, hash_schema, status
          ) VALUES (
            $1, 'V1-TEST-002', $2, $3, $4, 1, $5, 1, 'issued'
          )
        `, [v1DupId, testIds.issuerOrg, testIds.personParticipant, testIds.event, hash])
      ).rejects.toThrow();
    });

    it('supports legacy queries by credential_code and subject_entity_id', async () => {
      if (!dbAvailable) return;
      const queryRes = await client.query(`
        SELECT id, credential_code, credential_type, metadata_hash
        FROM credentials
        WHERE credential_code = 'V1-TEST-001'
      `);
      expect(queryRes.rows.length).toBe(1);
      expect(queryRes.rows[0].credential_code).toBe('V1-TEST-001');
    });
  });

  // ==========================================================================
  // PASO 5: TESTS V2 CREDENTIAL MODEL & CONSTRAINTS
  // ==========================================================================
  describe('Paso 5: V2 Credential Model & Constraints', () => {
    it('successfully inserts a Participant credential with solo mode, participation_id, and NULL credential_type', async () => {
      if (!dbAvailable) return;
      const credId = 'd0000002-0000-4000-8000-000000000001';
      const digest = '1'.repeat(64);

      const res = await client.query(`
        INSERT INTO credentials (
          id, public_id, issuer_entity_id, subject_entity_id, event_id,
          credential_family, participation_mode, participation_id, schema_version,
          display_label, display_subtitle, payload_digest, status, issued_at
        ) VALUES (
          $1, 'test_pub_participant_001', $2, $3, $4,
          'participant', 'solo', $5, 'culturago.credential.v2',
          'Participante', 'Solista', $6, 'issued', NOW()
        ) RETURNING id, public_id, credential_family, participation_mode, credential_type
      `, [credId, testIds.issuerOrg, testIds.personParticipant, testIds.event, testIds.participationSolo, digest]);

      expect(res.rows[0].id).toBe(credId);
      expect(res.rows[0].credential_family).toBe('participant');
      expect(res.rows[0].participation_mode).toBe('solo');
      expect(res.rows[0].credential_type).toBeNull();
    });

    it('successfully inserts a Guest credential with solo mode and participation_id', async () => {
      if (!dbAvailable) return;
      const credId = 'd0000002-0000-4000-8000-000000000002';
      const digest = '2'.repeat(64);

      const res = await client.query(`
        INSERT INTO credentials (
          id, public_id, issuer_entity_id, subject_entity_id, event_id,
          credential_family, participation_mode, participation_id, schema_version,
          display_label, display_subtitle, payload_digest, status, issued_at
        ) VALUES (
          $1, 'test_pub_guest_001', $2, $3, $4,
          'guest', 'solo', $5, 'culturago.credential.v2',
          'Invitada Especial', 'Solista', $6, 'issued', NOW()
        ) RETURNING id, credential_family, participation_mode
      `, [credId, testIds.issuerOrg, testIds.personGuest, testIds.event, testIds.participationGuest, digest]);

      expect(res.rows[0].credential_family).toBe('guest');
      expect(res.rows[0].participation_mode).toBe('solo');
    });

    it('successfully inserts a Staff credential with not_applicable mode, participation_id NULL, and multiple evidences', async () => {
      if (!dbAvailable) return;
      const credId = 'd0000002-0000-4000-8000-000000000003';
      const digest = '3'.repeat(64);

      await client.query(`
        INSERT INTO credentials (
          id, public_id, issuer_entity_id, subject_entity_id, event_id,
          credential_family, participation_mode, participation_id, schema_version,
          display_label, display_subtitle, payload_digest, status, issued_at
        ) VALUES (
          $1, 'test_pub_staff_001', $2, $3, $4,
          'staff', 'not_applicable', NULL, 'culturago.credential.v2',
          'Staff Verificado', 'Producción y Organización', $5, 'issued', NOW()
        )
      `, [credId, testIds.issuerOrg, testIds.personStaff, testIds.event, digest]);

      // Add two evidences for staff (producer_of + organizer_of)
      await client.query(`
        INSERT INTO credential_evidence (credential_id, source_type, source_id, evidence_role)
        VALUES
          ($1, 'relationship', $2, 'producer_of'),
          ($1, 'relationship', $3, 'organizer_of')
      `, [credId, testIds.relProducer, testIds.relOrganizer]);

      const evidenceCount = await client.query(`
        SELECT count(*)::int as count FROM credential_evidence WHERE credential_id = $1
      `, [credId]);
      expect(evidenceCount.rows[0].count).toBe(2);
    });

    // Rejection tests:
    it('rejects participant without participation_id (chk_credentials_v2_family_mode)', async () => {
      if (!dbAvailable) return;
      await expect(
        client.query(`
          INSERT INTO credentials (
            id, public_id, issuer_entity_id, subject_entity_id, event_id,
            credential_family, participation_mode, participation_id, schema_version
          ) VALUES (
            gen_random_uuid(), 'test_err_1', $1, $2, $3,
            'participant', 'solo', NULL, 'culturago.credential.v2'
          )
        `, [testIds.issuerOrg, testIds.personParticipant, testIds.event])
      ).rejects.toThrow(/chk_credentials_v2_family_mode/);
    });

    it('rejects participant with mode not_applicable (chk_credentials_v2_family_mode)', async () => {
      if (!dbAvailable) return;
      await expect(
        client.query(`
          INSERT INTO credentials (
            id, public_id, issuer_entity_id, subject_entity_id, event_id,
            credential_family, participation_mode, participation_id, schema_version
          ) VALUES (
            gen_random_uuid(), 'test_err_2', $1, $2, $3,
            'participant', 'not_applicable', $4, 'culturago.credential.v2'
          )
        `, [testIds.issuerOrg, testIds.personParticipant, testIds.event, testIds.participationSolo])
      ).rejects.toThrow(/chk_credentials_v2_family_mode/);
    });

    it('rejects staff with mode solo (chk_credentials_v2_family_mode)', async () => {
      if (!dbAvailable) return;
      await expect(
        client.query(`
          INSERT INTO credentials (
            id, public_id, issuer_entity_id, subject_entity_id, event_id,
            credential_family, participation_mode, participation_id, schema_version
          ) VALUES (
            gen_random_uuid(), 'test_err_3', $1, $2, $3,
            'staff', 'solo', NULL, 'culturago.credential.v2'
          )
        `, [testIds.issuerOrg, testIds.personStaff, testIds.event])
      ).rejects.toThrow(/chk_credentials_v2_family_mode/);
    });

    it('rejects V2 credential that specifies legacy credential_type (chk_credentials_version_coherence)', async () => {
      if (!dbAvailable) return;
      await expect(
        client.query(`
          INSERT INTO credentials (
            id, public_id, issuer_entity_id, subject_entity_id, event_id,
            credential_family, participation_mode, participation_id, schema_version, credential_type
          ) VALUES (
            gen_random_uuid(), 'test_err_4', $1, $2, $3,
            'participant', 'solo', $4, 'culturago.credential.v2', 1
          )
        `, [testIds.issuerOrg, testIds.personParticipant, testIds.event, testIds.participationSolo])
      ).rejects.toThrow(/chk_credentials_version_coherence/);
    });

    it('rejects invalid payload_digest format (chk_credentials_payload_digest)', async () => {
      if (!dbAvailable) return;
      await expect(
        client.query(`
          INSERT INTO credentials (
            id, public_id, issuer_entity_id, subject_entity_id, event_id,
            credential_family, participation_mode, participation_id, schema_version, payload_digest
          ) VALUES (
            gen_random_uuid(), 'test_err_5', $1, $2, $3,
            'participant', 'solo', $4, 'culturago.credential.v2', 'not-a-valid-sha256-hex'
          )
        `, [testIds.issuerOrg, testIds.personParticipant, testIds.event, testIds.participationSolo])
      ).rejects.toThrow(/chk_credentials_payload_digest/);
    });

    it('rejects duplicate public_id (uq_credentials_public_id)', async () => {
      if (!dbAvailable) return;
      await expect(
        client.query(`
          INSERT INTO credentials (
            id, public_id, issuer_entity_id, subject_entity_id, event_id,
            credential_family, participation_mode, participation_id, schema_version
          ) VALUES (
            gen_random_uuid(), 'test_pub_participant_001', $1, $2, $3,
            'participant', 'solo', $4, 'culturago.credential.v2'
          )
        `, [testIds.issuerOrg, testIds.personParticipant, testIds.event, testIds.participationSolo])
      ).rejects.toThrow(/uq_credentials_public_id/);
    });

    it('rejects duplicate non-revoked equivalent credential for same presentation (uq_credentials_participant_guest_non_revoked)', async () => {
      if (!dbAvailable) return;
      // An active (issued) credential already exists for testIds.personParticipant on testIds.participationSolo
      await expect(
        client.query(`
          INSERT INTO credentials (
            id, public_id, issuer_entity_id, subject_entity_id, event_id,
            credential_family, participation_mode, participation_id, schema_version, status
          ) VALUES (
            gen_random_uuid(), 'test_pub_dup_presentation', $1, $2, $3,
            'participant', 'solo', $4, 'culturago.credential.v2', 'draft'
          )
        `, [testIds.issuerOrg, testIds.personParticipant, testIds.event, testIds.participationSolo])
      ).rejects.toThrow(/uq_credentials_participant_guest_non_revoked/);
    });

    it('rejects second non-revoked staff credential for same subject and event (uq_credentials_staff_non_revoked)', async () => {
      if (!dbAvailable) return;
      // An active staff credential already exists for testIds.personStaff on testIds.event
      await expect(
        client.query(`
          INSERT INTO credentials (
            id, public_id, issuer_entity_id, subject_entity_id, event_id,
            credential_family, participation_mode, participation_id, schema_version, status
          ) VALUES (
            gen_random_uuid(), 'test_pub_dup_staff', $1, $2, $3,
            'staff', 'not_applicable', NULL, 'culturago.credential.v2', 'issued'
          )
        `, [testIds.issuerOrg, testIds.personStaff, testIds.event])
      ).rejects.toThrow(/uq_credentials_staff_non_revoked/);
    });

    it('allows issuing a new equivalent credential once the previous one is revoked', async () => {
      if (!dbAvailable) return;
      // 1. Create a credential that will be revoked
      const tempCredId = genRandomUUID();
      const tempPubId = 'test_pub_to_revoke_001';
      const tempPersonId = genRandomUUID();
      const tempParticipationId = genRandomUUID();

      const tempSlug = 'temp-revoke-' + tempPersonId.slice(0, 8);
      // Seed a unique person entity and temporary participation
      await client.query(`
        INSERT INTO entities (id, kind, display_name, slug, country, city)
        VALUES ($1, 'person', 'Temp Person Revoke', $2, 'Chile', 'Santiago')
      `, [tempPersonId, tempSlug]);

      await client.query(`
        INSERT INTO participations (id, subject_entity_id, event_id, state, presentation_code)
        VALUES ($1, $2, $3, 'registered', 'FDVC2026-REVOKE-TEST')
      `, [tempParticipationId, tempPersonId, testIds.event]);

      await client.query(`
        INSERT INTO credentials (
          id, public_id, issuer_entity_id, subject_entity_id, event_id,
          credential_family, participation_mode, participation_id, schema_version, status
        ) VALUES (
          $1, $2, $3, $4, $5,
          'participant', 'solo', $6, 'culturago.credential.v2', 'issued'
        )
      `, [tempCredId, tempPubId, testIds.issuerOrg, tempPersonId, testIds.event, tempParticipationId]);

      // 2. Revoke it
      await client.query(`
        UPDATE credentials SET status = 'revoked', revoked_at = NOW() WHERE id = $1
      `, [tempCredId]);

      // 3. Issue a new replacement credential for the same presentation
      const replacementCredId = genRandomUUID();
      const replacementPubId = 'test_pub_replacement_001';

      const replacementRes = await client.query(`
        INSERT INTO credentials (
          id, public_id, issuer_entity_id, subject_entity_id, event_id,
          credential_family, participation_mode, participation_id, schema_version, status
        ) VALUES (
          $1, $2, $3, $4, $5,
          'participant', 'solo', $6, 'culturago.credential.v2', 'issued'
        ) RETURNING id, status
      `, [replacementCredId, replacementPubId, testIds.issuerOrg, tempPersonId, testIds.event, tempParticipationId]);

      expect(replacementRes.rows[0].id).toBe(replacementCredId);
      expect(replacementRes.rows[0].status).toBe('issued');

      // Both credentials exist in history: original is revoked, new is issued
      const history = await client.query(`
        SELECT id, status FROM credentials WHERE participation_id = $1 ORDER BY created_at ASC
      `, [tempParticipationId]);
      expect(history.rows.length).toBe(2);
      expect(history.rows[0].status).toBe('revoked');
      expect(history.rows[1].status).toBe('issued');
    });
  });

  // ==========================================================================
  // PASO 6 & PASO 2: TESTS DE INTEGRIDAD DE EVIDENCIAS
  // ==========================================================================
  describe('Paso 6: Evidence Integrity & Multi-Evidence Rules', () => {
    it('validates domain check for source_type participation existing in participations', async () => {
      const mockContext = {
        participationExists: async (id: string) => id === testIds.participationSolo,
        relationshipExists: async () => false,
      };

      await expect(
        validateEvidenceInput({
          credentialId: 'cred-1',
          sourceType: 'participation',
          sourceId: testIds.participationSolo,
          evidenceRole: 'dancer',
        }, mockContext)
      ).resolves.toBeUndefined();
    });

    it('validates domain check for source_type relationship existing in relationships', async () => {
      const mockContext = {
        participationExists: async () => false,
        relationshipExists: async (id: string) => id === testIds.relProducer,
      };

      await expect(
        validateEvidenceInput({
          credentialId: 'cred-1',
          sourceType: 'relationship',
          sourceId: testIds.relProducer,
          evidenceRole: 'producer_of',
        }, mockContext)
      ).resolves.toBeUndefined();
    });

    it('rejects in domain when source_id does not exist in target table before INSERT', async () => {
      const mockContext = {
        participationExists: async () => false,
        relationshipExists: async () => false,
      };

      await expect(
        validateEvidenceInput({
          credentialId: 'cred-1',
          sourceType: 'participation',
          sourceId: 'non-existent-participation-id',
          evidenceRole: 'dancer',
        }, mockContext)
      ).rejects.toThrowError(expect.objectContaining({ code: 'INVALID_EVIDENCE' }));

      await expect(
        validateEvidenceInput({
          credentialId: 'cred-1',
          sourceType: 'relationship',
          sourceId: 'non-existent-rel-id',
          evidenceRole: 'producer_of',
        }, mockContext)
      ).rejects.toThrowError(expect.objectContaining({ code: 'INVALID_EVIDENCE' }));
    });

    it('rejects duplicated evidence item within the same credential (uq_credential_evidence_item)', async () => {
      if (!dbAvailable) return;
      const staffCredId = 'd0000002-0000-4000-8000-000000000003';

      // testIds.relProducer was already added to staffCredId earlier.
      // Inserting it a second time for the same credential must be rejected.
      await expect(
        client.query(`
          INSERT INTO credential_evidence (credential_id, source_type, source_id, evidence_role)
          VALUES ($1, 'relationship', $2, 'producer_of')
        `, [staffCredId, testIds.relProducer])
      ).rejects.toThrow(/uq_credential_evidence_item/);
    });

    it('confirms that credential_evidence allows the same evidence to support distinct credentials', async () => {
      if (!dbAvailable) return;
      // Step 2 Clarification:
      // credential_evidence allows a source_id (e.g. a participation) to be referenced by distinct credentials
      // (as long as credential-level equivalence rules in uq_credentials_... are satisfied, e.g. for different credentials).
      const credA = genRandomUUID();
      const credB = genRandomUUID();
      const sharedPersonId = genRandomUUID();
      const sharedParticipationId = genRandomUUID();

      const sharedSlug = 'shared-evid-' + sharedPersonId.slice(0, 8);
      // Seed another entity and participation
      await client.query(`
        INSERT INTO entities (id, kind, display_name, slug, country, city)
        VALUES ($1, 'person', 'Shared Person Multi Evid', $2, 'Chile', 'Santiago')
      `, [sharedPersonId, sharedSlug]);

      await client.query(`
        INSERT INTO participations (id, subject_entity_id, event_id, state, presentation_code)
        VALUES ($1, $2, $3, 'registered', 'FDVC2026-MULTI-EVID')
      `, [sharedParticipationId, sharedPersonId, testIds.event]);

      // Credential A (Participant)
      await client.query(`
        INSERT INTO credentials (
          id, public_id, issuer_entity_id, subject_entity_id, event_id,
          credential_family, participation_mode, participation_id, schema_version, status
        ) VALUES (
          $1, 'test_pub_multi_evid_a', $2, $3, $4,
          'participant', 'solo', $5, 'culturago.credential.v2', 'issued'
        )
      `, [credA, testIds.issuerOrg, sharedPersonId, testIds.event, sharedParticipationId]);

      // Add evidence to Credential A
      await client.query(`
        INSERT INTO credential_evidence (credential_id, source_type, source_id, evidence_role)
        VALUES ($1, 'participation', $2, 'dancer')
      `, [credA, sharedParticipationId]);

      // Credential B (e.g. an honorary certificate with family guest for another subject who also backed by same presentation)
      await client.query(`
        INSERT INTO credentials (
          id, public_id, issuer_entity_id, subject_entity_id, event_id,
          credential_family, participation_mode, participation_id, schema_version, status
        ) VALUES (
          $1, 'test_pub_multi_evid_b', $2, $3, $4,
          'guest', 'solo', $5, 'culturago.credential.v2', 'issued'
        )
      `, [credB, testIds.issuerOrg, testIds.personGuest, testIds.event, sharedParticipationId]);

      // credential_evidence allows linking the same participation as evidence to Credential B!
      await expect(
        client.query(`
          INSERT INTO credential_evidence (credential_id, source_type, source_id, evidence_role)
          VALUES ($1, 'participation', $2, 'guest_dancer')
        `, [credB, sharedParticipationId])
      ).resolves.toBeDefined();

      const evidences = await client.query(`
        SELECT credential_id, source_type, source_id
        FROM credential_evidence
        WHERE source_id = $1
      `, [sharedParticipationId]);
      expect(evidences.rows.length).toBe(2);
    });
  });

  // Domain unit checks for Credential V2 validator
  describe('Domain Unit Validations', () => {
    it('validates coherent CredentialV2DomainInput', () => {
      expect(() =>
        validateCredentialV2Input({
          publicId: 'cg_test',
          issuerEntityId: 'iss-1',
          subjectEntityId: 'sub-1',
          eventEntityId: 'ev-1',
          credentialFamily: 'participant',
          participationMode: 'solo',
          participationId: 'part-1',
          schemaVersion: 'culturago.credential.v2',
          displayLabel: 'Participante',
          displaySubtitle: 'Solista',
          canonicalPayload: {},
          payloadDigest: '0'.repeat(64),
        })
      ).not.toThrow();
    });

    it('rejects invalid schemaVersion', () => {
      expect(() =>
        validateCredentialV2Input({
          publicId: 'cg_test',
          issuerEntityId: 'iss-1',
          subjectEntityId: 'sub-1',
          eventEntityId: 'ev-1',
          credentialFamily: 'participant',
          participationMode: 'solo',
          participationId: 'part-1',
          schemaVersion: 'culturago.credential.v1' as never,
          displayLabel: 'Participante',
          displaySubtitle: 'Solista',
          canonicalPayload: {},
          payloadDigest: '0'.repeat(64),
        })
      ).toThrowError(expect.objectContaining({ code: 'INVALID_CREDENTIAL' }));
    });
  });
});

function genRandomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
