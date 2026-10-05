import { describe, it, expect } from 'vitest';
import {
  buildCanonicalPayloadV2,
  canonicalizePayloadV2,
  computePayloadDigestV2,
  CanonicalPayloadV2,
} from '@/domain/credentials/v2';
import { canonicalizeJson, buildDigestInput } from '@/infrastructure/hashing/canonicalize';
import { createHash } from 'node:crypto';

describe('Credential V2 Deterministic Golden Vectors (RFC 8785 JCS + SHA-256)', () => {
  // ==========================================================================
  // VECTOR A: Participant / Solo
  // ==========================================================================
  describe('Vector A: Participant / Solo', () => {
    const inputA = {
      publicId: 'cg2_golden_participant_solo_001',
      credentialFamily: 'participant' as const,
      participationMode: 'solo' as const,
      issuer: {
        id: 'a0000001-0000-4000-8000-000000000001',
        display_name: 'Festival Nacional Danza del Vientre Chile 2026',
        kind: 'organization',
        slug: 'fdvc-2026',
      },
      subject: {
        id: 'a0000002-0000-4000-8000-000000000002',
        display_name: 'Ana Francisca Pizarro Ruiz',
        kind: 'person',
        artistic_name: 'Ana Francisca Pizarro Ruiz',
        slug: 'ana-francisca-pizarro-ruiz',
      },
      event: {
        id: 'a0000003-0000-4000-8000-000000000003',
        name: 'Festival Nacional Danza del Vientre Chile 2026',
        year: 2026,
        start_date: '2026-09-05',
        end_date: '2026-09-05',
        location: 'Aula Magna Liceo Manuel de Salas, Ñuñoa, Santiago, Chile',
      },
      displayLabel: 'Participante',
      displaySubtitle: 'Solista',
      presentationCode: 'FDVC2026-001',
      organizationName: 'Reflejos de Oriente Tarapacá',
      roles: ['dancer'],
      evidences: [
        {
          source_type: 'participation' as const,
          source_id: 'b0000001-0000-4000-8000-000000000001',
          evidence_role: 'dancer',
        },
      ],
      issuedAt: '2026-10-05T00:00:00.000Z',
    };

    it('builds exact canonical representation and reproducible digest', () => {
      const payload = buildCanonicalPayloadV2(inputA);
      const canonical = canonicalizePayloadV2(payload);
      const digest = computePayloadDigestV2(payload);

      expect(canonical).toBe(
        '{"claim":{"display_label":"Participante","display_subtitle":"Solista","evidences":[{"evidence_role":"dancer","source_id":"b0000001-0000-4000-8000-000000000001","source_type":"participation"}],"organization_name":"Reflejos de Oriente Tarapacá","presentation_code":"FDVC2026-001","roles":["dancer"]},"credential_family":"participant","event":{"end_date":"2026-09-05","id":"a0000003-0000-4000-8000-000000000003","location":"Aula Magna Liceo Manuel de Salas, Ñuñoa, Santiago, Chile","name":"Festival Nacional Danza del Vientre Chile 2026","start_date":"2026-09-05","year":2026},"issued_at":"2026-10-05T00:00:00.000Z","issuer":{"display_name":"Festival Nacional Danza del Vientre Chile 2026","id":"a0000001-0000-4000-8000-000000000001","kind":"organization","slug":"fdvc-2026"},"participation_mode":"solo","public_id":"cg2_golden_participant_solo_001","schema_version":"culturago.credential.v2","subject":{"artistic_name":"Ana Francisca Pizarro Ruiz","display_name":"Ana Francisca Pizarro Ruiz","id":"a0000002-0000-4000-8000-000000000002","kind":"person","slug":"ana-francisca-pizarro-ruiz"}}'
      );

      // Hardcoded exact SHA-256 digest
      expect(digest).toBe('67bf028ead0b811e96e1e4fd71c43c44d969865cfd270b4ba161c8b1ddc3906c');
      expect(digest).toHaveLength(64);
    });

    it('is invariant to input property reordering', () => {
      // Reordered input properties
      const scrambledPayload = JSON.parse(JSON.stringify(buildCanonicalPayloadV2(inputA)));
      // Re-serializing through JCS must yield identical canonical bytes and digest
      const jcsOriginal = canonicalizeJson(buildCanonicalPayloadV2(inputA));
      const jcsScrambled = canonicalizeJson(scrambledPayload);

      expect(jcsScrambled).toBe(jcsOriginal);
      expect(computePayloadDigestV2(scrambledPayload as CanonicalPayloadV2)).toBe(
        computePayloadDigestV2(buildCanonicalPayloadV2(inputA))
      );
    });
  });

  // ==========================================================================
  // VECTOR B: Participant / Group
  // ==========================================================================
  describe('Vector B: Participant / Group', () => {
    const inputB = {
      publicId: 'cg2_golden_participant_group_002',
      credentialFamily: 'participant' as const,
      participationMode: 'group' as const,
      issuer: {
        id: 'a0000001-0000-4000-8000-000000000001',
        display_name: 'Festival Nacional Danza del Vientre Chile 2026',
        kind: 'organization',
        slug: 'fdvc-2026',
      },
      subject: {
        id: 'a0000010-0000-4000-8000-000000000010',
        display_name: 'Grupo Shazaditas Teens',
        kind: 'organization',
        slug: 'grupo-shazaditas-teens',
      },
      event: {
        id: 'a0000003-0000-4000-8000-000000000003',
        name: 'Festival Nacional Danza del Vientre Chile 2026',
        year: 2026,
      },
      displayLabel: 'Participante',
      displaySubtitle: 'Participación Grupal',
      presentationCode: 'FDVC2026-002',
      organizationName: 'Estudio Shazadi Fitness Integrado',
      roles: ['group_leader', 'dancer'], // unsorted intentionally
      evidences: [
        {
          source_type: 'participation' as const,
          source_id: 'b0000002-0000-4000-8000-000000000002',
          evidence_role: 'group_performance',
        },
      ],
      issuedAt: '2026-10-05T00:00:00.000Z',
    };

    it('sorts roles deterministically and produces exact golden digest', () => {
      const payload = buildCanonicalPayloadV2(inputB);
      // 'dancer' must sort before 'group_leader'
      expect(payload.claim.roles).toEqual(['dancer', 'group_leader']);

      const canonical = canonicalizePayloadV2(payload);
      const digest = computePayloadDigestV2(payload);

      expect(canonical).toBe(
        '{"claim":{"display_label":"Participante","display_subtitle":"Participación Grupal","evidences":[{"evidence_role":"group_performance","source_id":"b0000002-0000-4000-8000-000000000002","source_type":"participation"}],"organization_name":"Estudio Shazadi Fitness Integrado","presentation_code":"FDVC2026-002","roles":["dancer","group_leader"]},"credential_family":"participant","event":{"id":"a0000003-0000-4000-8000-000000000003","name":"Festival Nacional Danza del Vientre Chile 2026","year":2026},"issued_at":"2026-10-05T00:00:00.000Z","issuer":{"display_name":"Festival Nacional Danza del Vientre Chile 2026","id":"a0000001-0000-4000-8000-000000000001","kind":"organization","slug":"fdvc-2026"},"participation_mode":"group","public_id":"cg2_golden_participant_group_002","schema_version":"culturago.credential.v2","subject":{"display_name":"Grupo Shazaditas Teens","id":"a0000010-0000-4000-8000-000000000010","kind":"organization","slug":"grupo-shazaditas-teens"}}'
      );
      // Hardcoded exact SHA-256 digest
      expect(digest).toBe('fbd6930057c0bcd66869d3acee32d9897a009a4f6e9c098915ec0d3f2deb53a3');
      expect(digest).toHaveLength(64);
    });
  });

  // ==========================================================================
  // VECTOR C: Guest / Solo
  // ==========================================================================
  describe('Vector C: Guest / Solo', () => {
    const inputC = {
      publicId: 'cg2_golden_guest_solo_023',
      credentialFamily: 'guest' as const,
      participationMode: 'solo' as const,
      issuer: {
        id: 'a0000001-0000-4000-8000-000000000001',
        display_name: 'Festival Nacional Danza del Vientre Chile 2026',
        kind: 'organization',
      },
      subject: {
        id: 'a0000020-0000-4000-8000-000000000020',
        display_name: 'Nazarena',
        kind: 'person',
        artistic_name: 'Nazarena',
      },
      event: {
        id: 'a0000003-0000-4000-8000-000000000003',
        name: 'Festival Nacional Danza del Vientre Chile 2026',
      },
      displayLabel: 'Invitada Especial',
      displaySubtitle: 'Solista',
      presentationCode: 'FDVC2026-023',
      organizationName: 'Escuela Dana Amar',
      roles: ['dancer'],
      evidences: [
        {
          source_type: 'participation' as const,
          source_id: 'b0000023-0000-4000-8000-000000000023',
          evidence_role: 'honorary_solo',
        },
      ],
      issuedAt: '2026-10-05T00:00:00.000Z',
    };

    it('computes exact canonical payload and digest for Guest Solo', () => {
      const payload = buildCanonicalPayloadV2(inputC);
      const canonical = canonicalizePayloadV2(payload);
      const digest = computePayloadDigestV2(payload);

      expect(canonical).toBe(
        '{"claim":{"display_label":"Invitada Especial","display_subtitle":"Solista","evidences":[{"evidence_role":"honorary_solo","source_id":"b0000023-0000-4000-8000-000000000023","source_type":"participation"}],"organization_name":"Escuela Dana Amar","presentation_code":"FDVC2026-023","roles":["dancer"]},"credential_family":"guest","event":{"id":"a0000003-0000-4000-8000-000000000003","name":"Festival Nacional Danza del Vientre Chile 2026"},"issued_at":"2026-10-05T00:00:00.000Z","issuer":{"display_name":"Festival Nacional Danza del Vientre Chile 2026","id":"a0000001-0000-4000-8000-000000000001","kind":"organization"},"participation_mode":"solo","public_id":"cg2_golden_guest_solo_023","schema_version":"culturago.credential.v2","subject":{"artistic_name":"Nazarena","display_name":"Nazarena","id":"a0000020-0000-4000-8000-000000000020","kind":"person"}}'
      );
      // Hardcoded exact SHA-256 digest
      expect(digest).toBe('63db27019ac0f078f9d9b3b7d8ed2a3d7d500bd58683e3c021b4e67ebd142ee2');
      expect(digest).toHaveLength(64);
    });
  });

  // ==========================================================================
  // VECTOR D: Guest / Group
  // ==========================================================================
  describe('Vector D: Guest / Group', () => {
    const inputD = {
      publicId: 'cg2_golden_guest_group_020',
      credentialFamily: 'guest' as const,
      participationMode: 'group' as const,
      issuer: {
        id: 'a0000001-0000-4000-8000-000000000001',
        display_name: 'Festival Nacional Danza del Vientre Chile 2026',
        kind: 'organization',
      },
      subject: {
        id: 'a0000030-0000-4000-8000-000000000030',
        display_name: 'Malaikas',
        kind: 'organization',
      },
      event: {
        id: 'a0000003-0000-4000-8000-000000000003',
        name: 'Festival Nacional Danza del Vientre Chile 2026',
      },
      displayLabel: 'Invitada Especial',
      displaySubtitle: 'Participación Grupal',
      presentationCode: 'FDVC2026-020',
      organizationName: 'Escuela Dana Amar',
      roles: ['group_leader'],
      evidences: [
        {
          source_type: 'participation' as const,
          source_id: 'b0000020-0000-4000-8000-000000000020',
          evidence_role: 'honorary_group',
        },
      ],
      issuedAt: '2026-10-05T00:00:00.000Z',
    };

    it('computes exact canonical payload and digest for Guest Group', () => {
      const payload = buildCanonicalPayloadV2(inputD);
      const canonical = canonicalizePayloadV2(payload);
      const digest = computePayloadDigestV2(payload);

      expect(canonical).toBe(
        '{"claim":{"display_label":"Invitada Especial","display_subtitle":"Participación Grupal","evidences":[{"evidence_role":"honorary_group","source_id":"b0000020-0000-4000-8000-000000000020","source_type":"participation"}],"organization_name":"Escuela Dana Amar","presentation_code":"FDVC2026-020","roles":["group_leader"]},"credential_family":"guest","event":{"id":"a0000003-0000-4000-8000-000000000003","name":"Festival Nacional Danza del Vientre Chile 2026"},"issued_at":"2026-10-05T00:00:00.000Z","issuer":{"display_name":"Festival Nacional Danza del Vientre Chile 2026","id":"a0000001-0000-4000-8000-000000000001","kind":"organization"},"participation_mode":"group","public_id":"cg2_golden_guest_group_020","schema_version":"culturago.credential.v2","subject":{"display_name":"Malaikas","id":"a0000030-0000-4000-8000-000000000030","kind":"organization"}}'
      );
      // Hardcoded exact SHA-256 digest
      expect(digest).toBe('466ae7aa893e1a68e8998218a8448f93a7c38453b931e0d8d3e2d5d91cdddc33');
      expect(digest).toHaveLength(64);
    });
  });

  // ==========================================================================
  // VECTOR E: Staff (Multi-Evidence)
  // ==========================================================================
  describe('Vector E: Staff (Multi-Evidence)', () => {
    const inputE = {
      publicId: 'cg2_golden_staff_001',
      credentialFamily: 'staff' as const,
      participationMode: 'not_applicable' as const,
      issuer: {
        id: 'a0000001-0000-4000-8000-000000000001',
        display_name: 'Festival Nacional Danza del Vientre Chile 2026',
        kind: 'organization',
      },
      subject: {
        id: 'a0000040-0000-4000-8000-000000000040',
        display_name: 'Marcos Reyes',
        kind: 'person',
      },
      event: {
        id: 'a0000003-0000-4000-8000-000000000003',
        name: 'Festival Nacional Danza del Vientre Chile 2026',
      },
      displayLabel: 'Staff Verificado',
      displaySubtitle: 'Producción y Organización',
      roles: ['producer', 'organizer'], // will be sorted alphabetically: organizer, producer
      evidences: [
        // Intentionally given in reverse order to verify deterministic sorting
        {
          source_type: 'relationship' as const,
          source_id: 'c0000002-0000-4000-8000-000000000002',
          evidence_role: 'producer_of',
        },
        {
          source_type: 'relationship' as const,
          source_id: 'c0000001-0000-4000-8000-000000000001',
          evidence_role: 'organizer_of',
        },
      ],
      issuedAt: '2026-10-05T00:00:00.000Z',
    };

    it('sorts both roles and evidences deterministically and produces exact golden digest', () => {
      const payload = buildCanonicalPayloadV2(inputE);

      expect(payload.claim.roles).toEqual(['organizer', 'producer']);
      expect(payload.claim.evidences[0].source_id).toBe('c0000001-0000-4000-8000-000000000001');
      expect(payload.claim.evidences[1].source_id).toBe('c0000002-0000-4000-8000-000000000002');

      const canonical = canonicalizePayloadV2(payload);
      const digest = computePayloadDigestV2(payload);

      expect(canonical).toBe(
        '{"claim":{"display_label":"Staff Verificado","display_subtitle":"Producción y Organización","evidences":[{"evidence_role":"organizer_of","source_id":"c0000001-0000-4000-8000-000000000001","source_type":"relationship"},{"evidence_role":"producer_of","source_id":"c0000002-0000-4000-8000-000000000002","source_type":"relationship"}],"roles":["organizer","producer"]},"credential_family":"staff","event":{"id":"a0000003-0000-4000-8000-000000000003","name":"Festival Nacional Danza del Vientre Chile 2026"},"issued_at":"2026-10-05T00:00:00.000Z","issuer":{"display_name":"Festival Nacional Danza del Vientre Chile 2026","id":"a0000001-0000-4000-8000-000000000001","kind":"organization"},"participation_mode":"not_applicable","public_id":"cg2_golden_staff_001","schema_version":"culturago.credential.v2","subject":{"display_name":"Marcos Reyes","id":"a0000040-0000-4000-8000-000000000040","kind":"person"}}'
      );
      // Hardcoded exact SHA-256 digest
      expect(digest).toBe('c55ab39d44b10e4d43baf249b2db526594e2b3af61a7ed68078361f68c72c8ba');
      expect(digest).toHaveLength(64);
    });
  });

  // ==========================================================================
  // DOMAIN SEPARATOR BYTE-LEVEL STRICT CONFORMANCE
  // ==========================================================================
  describe('Domain Separator Strict Byte-Level Conformance', () => {
    it('constructs domain separator byte-by-byte matching UTF8("CULTURAGO") || 0x00 || UTF8("culturago.credential.v2") || 0x00 || UTF8(JCS)', () => {
      const canonical = '{"test":true}';
      const digestInput = buildDigestInput('culturago.credential.v2', canonical);

      const expectedBytes = Buffer.concat([
        Buffer.from('CULTURAGO', 'utf8'),
        Buffer.from([0x00]),
        Buffer.from('culturago.credential.v2', 'utf8'),
        Buffer.from([0x00]),
        Buffer.from(canonical, 'utf8'),
      ]);

      expect(Buffer.from(digestInput)).toEqual(expectedBytes);
      expect(digestInput[9]).toBe(0x00); // 0x00 after CULTURAGO
      expect(digestInput[9 + 1 + 'culturago.credential.v2'.length]).toBe(0x00); // 0x00 after schemaId

      // Verify no literal '\\0' characters (0x5c, 0x30)
      const inputStr = Buffer.from(digestInput).toString('binary');
      expect(inputStr.includes('\\0')).toBe(false);
    });
  });
});
