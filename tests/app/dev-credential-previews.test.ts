import { describe, it, expect } from 'vitest';
import {
  getPreviewCase,
  getAllPreviewCases,
  FDVC2026_EVENT_INFO,
} from '@/fixtures/fdvc2026-previews';
import { buildFdvc2026PreviewPdf } from '@/infrastructure/credentials/v2/previewPdfCertificate';

describe('FDVC 2026 Functional Previews Suite', () => {
  it('loads all 4 preview cases with exact metadata and approved texts', () => {
    const cases = getAllPreviewCases();
    expect(cases).toHaveLength(4);

    const ids = cases.map((c) => c.id);
    expect(ids).toEqual([
      'preview_fdvc2026_001',
      'preview_fdvc2026_002',
      'preview_fdvc2026_030',
      'preview_fdvc2026_020',
    ]);
  });

  describe('Case A: Participante Solista (Ana Francisca Pizarro Ruiz)', () => {
    const caseA = getPreviewCase('preview_fdvc2026_001');

    it('has exact cultural metadata', () => {
      expect(caseA).not.toBeNull();
      expect(caseA!.presentationCode).toBe('FDVC2026-001');
      expect(caseA!.subject.displayName).toBe('Ana Francisca Pizarro Ruiz');
      expect(caseA!.organizationName).toBe('Reflejos de Oriente Tarapacá');
      expect(caseA!.family).toBe('participant');
      expect(caseA!.mode).toBe('solo');
      expect(caseA!.displayLabel).toBe('Participante');
      expect(caseA!.displaySubtitle).toBe('Solista');
      expect(caseA!.certificateType).toBe('CERTIFICADO DE PARTICIPACIÓN');
    });

    it('generates an A4 Landscape PDF with exact approved texts and vector QR', () => {
      const pdf = buildFdvc2026PreviewPdf(caseA!, 'https://culturago.cl/preview/001');
      expect(Buffer.isBuffer(pdf)).toBe(true);

      const pdfStr = pdf.toString('binary');
      expect(pdfStr.startsWith('%PDF-1.4')).toBe(true);
      expect(pdfStr.includes('%%EOF')).toBe(true);
      expect(pdfStr.includes('/MediaBox [0 0 842 595]')).toBe(true); // A4 Landscape
      expect(pdfStr.includes('CERTIFICADO DE PARTICIPACI\\323N')).toBe(true);
      expect(pdfStr.includes('Ana Francisca Pizarro Ruiz')).toBe(true);
      expect(pdfStr.includes('Reflejos de Oriente Tarapac\\341')).toBe(true);
      expect(pdfStr.includes('PREVIEW-FDVC2026-001')).toBe(true);
      expect(pdfStr.includes('CulturaGO')).toBe(true);

      // Ensures NO full SHA-256 digest is printed on the certificate
      expect(pdfStr).not.toMatch(/[0-9a-f]{64}/);
    });
  });

  describe('Case B: Participación Grupal (Grupo Shazaditas Teens)', () => {
    const caseB = getPreviewCase('preview_fdvc2026_002');

    it('has exact cultural metadata', () => {
      expect(caseB).not.toBeNull();
      expect(caseB!.presentationCode).toBe('FDVC2026-002');
      expect(caseB!.subject.displayName).toBe('Grupo Shazaditas Teens');
      expect(caseB!.organizationName).toBe('Estudio Shazadi Fitness Integrado');
      expect(caseB!.family).toBe('participant');
      expect(caseB!.mode).toBe('group');
      expect(caseB!.displayLabel).toBe('Participación Grupal');
      expect(caseB!.displaySubtitle).toBe('Participación Grupal');
      expect(caseB!.certificateType).toBe('CERTIFICADO DE PARTICIPACIÓN');
    });

    it('generates an A4 Landscape PDF with representation text', () => {
      const pdf = buildFdvc2026PreviewPdf(caseB!, 'https://culturago.cl/preview/002');
      const pdfStr = pdf.toString('binary');

      expect(pdfStr.includes('Grupo Shazaditas Teens')).toBe(true);
      expect(pdfStr.includes('Estudio Shazadi Fitness Integrado')).toBe(true);
      expect(pdfStr.includes('representando a')).toBe(true);
      expect(pdfStr.includes('PREVIEW-FDVC2026-002')).toBe(true);
    });
  });

  describe('Case C: Invitada Solista (Anne Marie Lolas)', () => {
    const caseC = getPreviewCase('preview_fdvc2026_030');

    it('has exact cultural metadata', () => {
      expect(caseC).not.toBeNull();
      expect(caseC!.presentationCode).toBe('FDVC2026-030');
      expect(caseC!.subject.displayName).toBe('Anne Marie Lolas');
      expect(caseC!.organizationName).toBeUndefined();
      expect(caseC!.family).toBe('guest');
      expect(caseC!.mode).toBe('solo');
      expect(caseC!.displayLabel).toBe('Invitada');
      expect(caseC!.displaySubtitle).toBe('Solista');
      expect(caseC!.certificateType).toBe('RECONOCIMIENTO');
    });

    it('generates an A4 Landscape PDF with guest recognition text', () => {
      const pdf = buildFdvc2026PreviewPdf(caseC!, 'https://culturago.cl/preview/030');
      const pdfStr = pdf.toString('binary');

      expect(pdfStr.includes('RECONOCIMIENTO')).toBe(true);
      expect(pdfStr.includes('Anne Marie Lolas')).toBe(true);
      expect(pdfStr.includes('por su participaci\\363n como invitada')).toBe(true);
      expect(pdfStr.includes('PREVIEW-FDVC2026-030')).toBe(true);
    });
  });

  describe('Case D: Invitada Grupal (Malaikas)', () => {
    const caseD = getPreviewCase('preview_fdvc2026_020');

    it('has exact cultural metadata', () => {
      expect(caseD).not.toBeNull();
      expect(caseD!.presentationCode).toBe('FDVC2026-020');
      expect(caseD!.subject.displayName).toBe('Malaikas');
      expect(caseD!.organizationName).toBe('Escuela Dana Amar');
      expect(caseD!.family).toBe('guest');
      expect(caseD!.mode).toBe('group');
      expect(caseD!.displayLabel).toBe('Invitadas');
      expect(caseD!.displaySubtitle).toBe('Participación Grupal');
      expect(caseD!.certificateType).toBe('RECONOCIMIENTO');
    });

    it('generates an A4 Landscape PDF with group guest recognition text and school', () => {
      const pdf = buildFdvc2026PreviewPdf(caseD!, 'https://culturago.cl/preview/020');
      const pdfStr = pdf.toString('binary');

      expect(pdfStr.includes('RECONOCIMIENTO')).toBe(true);
      expect(pdfStr.includes('Malaikas')).toBe(true);
      expect(pdfStr.includes('Escuela Dana Amar')).toBe(true);
      expect(pdfStr.includes('por su participaci\\363n como agrupaci\\363n invitada')).toBe(true);
      expect(pdfStr.includes('PREVIEW-FDVC2026-020')).toBe(true);
    });
  });

  it('verifies common festival event details across all fixtures', () => {
    expect(FDVC2026_EVENT_INFO.name).toBe('Festival Nacional Danza del Vientre Chile 2026');
    expect(FDVC2026_EVENT_INFO.dateText).toBe('5 de septiembre de 2026');
    expect(FDVC2026_EVENT_INFO.locationText).toBe(
      'Aula Magna, Liceo Experimental Manuel de Salas, Ñuñoa, Santiago de Chile'
    );
    expect(FDVC2026_EVENT_INFO.issuerName).toBe('Festival Nacional Danza del Vientre Chile');
  });
});
