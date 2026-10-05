import { PublicCredentialView } from './CredentialV2Service';

function escapePdfText(str: string): string {
  // Strip non-ASCII or replace common Spanish accented characters to ensure standard Helvetica compatibility
  const sanitized = str
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i')
    .replace(/ó/g, 'o')
    .replace(/ú/g, 'u')
    .replace(/Á/g, 'A')
    .replace(/É/g, 'E')
    .replace(/Í/g, 'I')
    .replace(/Ó/g, 'O')
    .replace(/Ú/g, 'U')
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/[^\x20-\x7E]/g, ' ');

  return sanitized
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

interface PdfTextBlock {
  text: string;
  size: number;
  y: number;
  bold?: boolean;
}

export function buildCredentialV2Pdf(
  cred: PublicCredentialView,
  verificationUrl: string
): Buffer {
  const subjectName = cred.subject.artisticName
    ? `${cred.subject.displayName} ("${cred.subject.artisticName}")`
    : cred.subject.displayName;

  const isRevoked = cred.status === 'revoked';

  const blocks: PdfTextBlock[] = [
    { text: '========================================================', size: 10, y: 760 },
    { text: 'CULTURAGO  -  CERTIFICADO DE ACREDITACION CULTURAL', size: 14, y: 740, bold: true },
    { text: '========================================================', size: 10, y: 720 },

    { text: cred.displayLabel.toUpperCase(), size: 16, y: 685, bold: true },
    { text: cred.displaySubtitle, size: 12, y: 665 },

    { text: 'OTORGADO A:', size: 10, y: 625 },
    { text: subjectName, size: 15, y: 605, bold: true },

    { text: `ROL(ES): ${cred.roles.join(', ') || 'Participante'}`, size: 11, y: 575 },
    { text: `EVENTO: ${cred.event.name}${cred.event.year ? ` (${cred.event.year})` : ''}`, size: 11, y: 555 },
    { text: `LUGAR: ${cred.event.location || 'Chile'}`, size: 10, y: 535 },
  ];

  if (cred.presentationCode) {
    blocks.push({ text: `CODIGO DE PRESENTACION: ${cred.presentationCode}`, size: 10, y: 515 });
  }
  if (cred.organizationName) {
    blocks.push({ text: `ORGANIZACION / ESCUELA: ${cred.organizationName}`, size: 10, y: 495 });
  }

  blocks.push(
    { text: `EMITIDO POR: ${cred.issuer.displayName}`, size: 10, y: 465 },
    { text: `FECHA DE EMISION: ${cred.issuedAt.slice(0, 10)}`, size: 10, y: 445 },
    { text: `ESTADO ACTUAL: ${isRevoked ? 'REVOCADA' : 'ACTIVA / VIGENTE'}`, size: 11, y: 415, bold: true }
  );

  if (isRevoked && cred.revokedAt) {
    blocks.push({ text: `FECHA DE REVOCACION: ${cred.revokedAt.slice(0, 10)}`, size: 10, y: 395 });
  }

  // Technical verification block
  blocks.push(
    { text: '--------------------------------------------------------', size: 10, y: 360 },
    { text: 'DATOS DE VERIFICACION CRIPTOGRAFICA OFF-CHAIN (V2):', size: 9, y: 345, bold: true },
    { text: `ID Publico: ${cred.publicId}`, size: 9, y: 330 },
    { text: `Esquema: ${cred.schemaVersion} (RFC 8785 JCS)`, size: 9, y: 315 },
    { text: `Digest SHA-256: ${cred.payloadDigest}`, size: 8, y: 300 },
    { text: `URL de Verificacion: ${verificationUrl}`, size: 9, y: 280 },
    { text: '--------------------------------------------------------', size: 10, y: 265 },
    { text: 'Validez y autenticidad comprobable publicamente sin intermediarios.', size: 8, y: 245 }
  );

  const textStreams = blocks.map((b) => {
    const font = b.bold ? '/F2' : '/F1';
    return `BT ${font} ${b.size} Tf 50 ${b.y} Td (${escapePdfText(b.text)}) Tj ET`;
  }).join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj',
    `6 0 obj << /Length ${Buffer.byteLength(textStreams, 'utf-8')} >> stream\n${textStreams}\nendstream endobj`,
  ];

  const header = '%PDF-1.4\n';
  let body = '';
  let offset = header.length;
  const xref: string[] = [];

  for (const obj of objects) {
    xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    body += obj + '\n';
    offset += Buffer.byteLength(obj, 'utf-8') + 1;
  }

  const xrefStart = offset;
  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  const xrefTable = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xref.join('')}`;

  return Buffer.from(header + body + xrefTable + trailer, 'utf-8');
}
