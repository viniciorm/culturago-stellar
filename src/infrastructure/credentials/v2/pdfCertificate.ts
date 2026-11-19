import { PublicCredentialView } from './CredentialV2Service';

const ROLE_LABELS_ES: Record<string, string> = {
  dancer: 'Bailarina / Intérprete',
  teacher: 'Profesora',
  director: 'Directora',
  group_leader: 'Líder de grupo',
  photographer: 'Fotógrafo Oficial',
  cameraman: 'Camarógrafo Oficial',
  production: 'Producción',
  organizer: 'Organización',
};

function formatRolesInSpanish(roles: string[]): string {
  if (!roles || roles.length === 0) return 'Participante';
  return roles.map((r) => ROLE_LABELS_ES[r] ?? r).join(', ');
}

function formatTimestampWithTimezone(raw: string | Date): string {
  const iso = (raw as unknown) instanceof Date ? (raw as Date).toISOString() : String(raw ?? '').trim();
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.exec(iso);
  if (match) {
    const tz = match[3] === 'Z' ? 'UTC' : `UTC${match[3]}`;
    return `${match[1]} ${match[2]} (${tz})`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return `${iso} (UTC)`;
  }
  return `${iso} (UTC)`;
}

/**
 * Escapes characters for PDF literal strings using /WinAnsiEncoding.
 * Preserves Spanish vowels with tildes (á, é, í, ó, ú, ü), ñ/Ñ, and punctuation.
 */
function escapePdfWinAnsi(str: string): string {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = ch.charCodeAt(0);

    if (ch === '\\' || ch === '(' || ch === ')') {
      out += '\\' + ch;
    } else if (code >= 32 && code <= 126) {
      out += ch;
    } else if (ch === '—') {
      out += '\\227';
    } else if (ch === '–') {
      out += '\\226';
    } else if (ch === '•') {
      out += '\\225';
    } else if (ch === '“') {
      out += '\\223';
    } else if (ch === '”') {
      out += '\\224';
    } else if (code >= 160 && code <= 255) {
      out += '\\' + code.toString(8).padStart(3, '0');
    } else {
      out += ' ';
    }
  }
  return out;
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
    { text: 'CULTURAGO — Constancia de participación cultural', size: 14, y: 740, bold: true },
    { text: '========================================================', size: 10, y: 720 },

    { text: cred.displayLabel.toUpperCase(), size: 16, y: 685, bold: true },
    { text: cred.displaySubtitle, size: 12, y: 665 },

    { text: 'OTORGADO A:', size: 10, y: 625 },
    { text: subjectName, size: 15, y: 605, bold: true },

    { text: `ROL(ES): ${formatRolesInSpanish(cred.roles)}`, size: 11, y: 575 },
    { text: `EVENTO: ${cred.event.name}${cred.event.year ? ` (${cred.event.year})` : ''}`, size: 11, y: 555 },
    { text: `LUGAR: ${cred.event.location || 'Chile'}`, size: 10, y: 535 },
  ];

  if (cred.presentationCode) {
    blocks.push({ text: `CÓDIGO DE PRESENTACIÓN: ${cred.presentationCode}`, size: 10, y: 515 });
  }
  if (cred.organizationName) {
    blocks.push({ text: `ORGANIZACIÓN / ESCUELA: ${cred.organizationName}`, size: 10, y: 495 });
  }

  blocks.push(
    { text: `EMITIDO POR: ${cred.issuer.displayName}`, size: 10, y: 465 },
    { text: `FECHA DE EMISIÓN: ${formatTimestampWithTimezone(cred.issuedAt)}`, size: 10, y: 445 },
    {
      text: `ESTADO ACTUAL: ${
        isRevoked
          ? 'REVOCADA (REGISTRO LOCAL)'
          : cred.status === 'draft'
            ? 'BORRADOR — SIN CONFIRMACIÓN STELLAR'
            : 'REGISTRO LOCAL — SIN CONFIRMACIÓN STELLAR'
      }`,
      size: 11,
      y: 415,
      bold: true,
    }
  );

  if (isRevoked && cred.revokedAt) {
    blocks.push({
      text: `FECHA DE REVOCACIÓN: ${formatTimestampWithTimezone(cred.revokedAt)}`,
      size: 10,
      y: 395,
    });
  }

  // Technical verification block
  blocks.push(
    { text: '--------------------------------------------------------', size: 10, y: 360 },
    { text: 'DATOS DE VERIFICACIÓN CRIPTOGRÁFICA OFF-CHAIN (V2):', size: 9, y: 345, bold: true },
    { text: `ID Público: ${cred.publicId}`, size: 9, y: 330 },
    { text: `Esquema: ${cred.schemaVersion} (RFC 8785 JCS)`, size: 9, y: 315 },
    { text: `Digest SHA-256: ${cred.payloadDigest}`, size: 8, y: 300 },
    { text: `URL de Consulta: ${verificationUrl}`, size: 9, y: 280 },
    { text: '--------------------------------------------------------', size: 10, y: 265 },
    {
      text: 'Registro local — sin confirmación Stellar: este documento no confirma un anclaje en Stellar.',
      size: 8,
      y: 245,
    }
  );

  const textStreams = blocks
    .map((b) => {
      const font = b.bold ? '/F2' : '/F1';
      return `BT ${font} ${b.size} Tf 50 ${b.y} Td (${escapePdfWinAnsi(b.text)}) Tj ET`;
    })
    .join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj',
    `6 0 obj << /Length ${Buffer.byteLength(textStreams, 'binary')} >> stream\n${textStreams}\nendstream endobj`,
  ];

  const header = '%PDF-1.4\n';
  let body = '';
  let offset = header.length;
  const xref: string[] = [];

  for (const obj of objects) {
    xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    body += obj + '\n';
    offset += Buffer.byteLength(obj, 'binary') + 1;
  }

  const xrefStart = offset;
  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  const xrefTable = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xref.join('')}`;

  return Buffer.from(header + body + xrefTable + trailer, 'binary');
}
