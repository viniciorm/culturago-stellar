export interface Fdvc2026PreviewCase {
  id: string;
  previewCode: string;
  presentationCode: string;
  caseLetter: 'A' | 'B' | 'C' | 'D';
  caseTitle: string;
  family: 'participant' | 'guest';
  mode: 'solo' | 'group';
  displayLabel: string;
  displaySubtitle: string;
  subject: {
    displayName: string;
    kind: 'person' | 'organization';
    artisticName?: string;
  };
  organizationName?: string;
  certificateType: 'CERTIFICADO DE PARTICIPACIÓN' | 'RECONOCIMIENTO';
  certificateTextLines: string[];
  event: {
    name: string;
    year: number;
    dateText: string;
    locationText: string;
  };
  issuer: {
    name: string;
    kind: string;
  };
  roles: string[];
  status: 'preview';
}

export const FDVC2026_EVENT_INFO = {
  name: 'Festival Nacional Danza del Vientre Chile 2026',
  year: 2026,
  dateText: '5 de septiembre de 2026',
  locationText: 'Aula Magna, Liceo Experimental Manuel de Salas, Ñuñoa, Santiago de Chile',
  issuerName: 'Festival Nacional Danza del Vientre Chile',
};

export const FDVC2026_PREVIEWS: Record<string, Fdvc2026PreviewCase> = {
  preview_fdvc2026_001: {
    id: 'preview_fdvc2026_001',
    previewCode: 'PREVIEW-FDVC2026-001',
    presentationCode: 'FDVC2026-001',
    caseLetter: 'A',
    caseTitle: 'Participante Solista',
    family: 'participant',
    mode: 'solo',
    displayLabel: 'Participante',
    displaySubtitle: 'Solista',
    subject: {
      displayName: 'Ana Francisca Pizarro Ruiz',
      kind: 'person',
      artisticName: 'Ana Francisca Pizarro Ruiz',
    },
    organizationName: 'Reflejos de Oriente Tarapacá',
    certificateType: 'CERTIFICADO DE PARTICIPACIÓN',
    certificateTextLines: [
      'El Festival Nacional Danza del Vientre Chile',
      'certifica la participación de',
      'Ana Francisca Pizarro Ruiz',
      'en el Festival Nacional Danza del Vientre Chile 2026,',
      'realizado el 5 de septiembre de 2026',
      'en Ñuñoa, Santiago de Chile.',
    ],
    event: FDVC2026_EVENT_INFO,
    issuer: {
      name: FDVC2026_EVENT_INFO.issuerName,
      kind: 'organization',
    },
    roles: ['dancer'],
    status: 'preview',
  },

  preview_fdvc2026_002: {
    id: 'preview_fdvc2026_002',
    previewCode: 'PREVIEW-FDVC2026-002',
    presentationCode: 'FDVC2026-002',
    caseLetter: 'B',
    caseTitle: 'Participación Grupal',
    family: 'participant',
    mode: 'group',
    displayLabel: 'Participación Grupal',
    displaySubtitle: 'Participación Grupal',
    subject: {
      displayName: 'Grupo Shazaditas Teens',
      kind: 'organization',
    },
    organizationName: 'Estudio Shazadi Fitness Integrado',
    certificateType: 'CERTIFICADO DE PARTICIPACIÓN',
    certificateTextLines: [
      'El Festival Nacional Danza del Vientre Chile',
      'certifica la participación de',
      'Grupo Shazaditas Teens',
      'representando a',
      'Estudio Shazadi Fitness Integrado',
      'en el Festival Nacional Danza del Vientre Chile 2026,',
      'realizado el 5 de septiembre de 2026',
      'en Ñuñoa, Santiago de Chile.',
    ],
    event: FDVC2026_EVENT_INFO,
    issuer: {
      name: FDVC2026_EVENT_INFO.issuerName,
      kind: 'organization',
    },
    roles: ['dancer'],
    status: 'preview',
  },

  preview_fdvc2026_030: {
    id: 'preview_fdvc2026_030',
    previewCode: 'PREVIEW-FDVC2026-030',
    presentationCode: 'FDVC2026-030',
    caseLetter: 'C',
    caseTitle: 'Invitada Solista',
    family: 'guest',
    mode: 'solo',
    displayLabel: 'Invitada',
    displaySubtitle: 'Solista',
    subject: {
      displayName: 'Anne Marie Lolas',
      kind: 'person',
      artisticName: 'Anne Marie Lolas',
    },
    certificateType: 'RECONOCIMIENTO',
    certificateTextLines: [
      'El Festival Nacional Danza del Vientre Chile',
      'otorga el presente reconocimiento a',
      'Anne Marie Lolas',
      'por su participación como invitada',
      'en el Festival Nacional Danza del Vientre Chile 2026,',
      'realizado el 5 de septiembre de 2026',
      'en Ñuñoa, Santiago de Chile.',
    ],
    event: FDVC2026_EVENT_INFO,
    issuer: {
      name: FDVC2026_EVENT_INFO.issuerName,
      kind: 'organization',
    },
    roles: ['guest_artist'],
    status: 'preview',
  },

  preview_fdvc2026_020: {
    id: 'preview_fdvc2026_020',
    previewCode: 'PREVIEW-FDVC2026-020',
    presentationCode: 'FDVC2026-020',
    caseLetter: 'D',
    caseTitle: 'Invitada Grupal',
    family: 'guest',
    mode: 'group',
    displayLabel: 'Invitadas',
    displaySubtitle: 'Participación Grupal',
    subject: {
      displayName: 'Malaikas',
      kind: 'organization',
    },
    organizationName: 'Escuela Dana Amar',
    certificateType: 'RECONOCIMIENTO',
    certificateTextLines: [
      'El Festival Nacional Danza del Vientre Chile',
      'otorga el presente reconocimiento a',
      'Malaikas',
      'por su participación como agrupación invitada',
      'en el Festival Nacional Danza del Vientre Chile 2026,',
      'realizado el 5 de septiembre de 2026',
      'en Ñuñoa, Santiago de Chile.',
    ],
    event: FDVC2026_EVENT_INFO,
    issuer: {
      name: FDVC2026_EVENT_INFO.issuerName,
      kind: 'organization',
    },
    roles: ['guest_artist'],
    status: 'preview',
  },
};

export function getPreviewCase(id: string): Fdvc2026PreviewCase | null {
  return FDVC2026_PREVIEWS[id] ?? null;
}

export function getAllPreviewCases(): Fdvc2026PreviewCase[] {
  return Object.values(FDVC2026_PREVIEWS);
}
