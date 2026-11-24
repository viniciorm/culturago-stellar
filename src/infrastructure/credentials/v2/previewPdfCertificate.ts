import QRCode from 'qrcode';
import { Fdvc2026PreviewCase } from '@/fixtures/fdvc2026-previews';

/**
 * Escapes characters for PDF literal strings using /WinAnsiEncoding.
 * Handles Spanish vowels with tildes, ñ, and common punctuation.
 */
function escapeWinAnsi(str: string): string {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = ch.charCodeAt(0);

    if (ch === '\\' || ch === '(' || ch === ')') {
      out += '\\' + ch;
    } else if (code >= 32 && code <= 126) {
      out += ch;
    } else if (ch === '—') {
      out += '\\227'; // WinAnsi em-dash
    } else if (ch === '–') {
      out += '\\226'; // WinAnsi en-dash
    } else if (ch === '•') {
      out += '\\225'; // WinAnsi bullet
    } else if (code >= 160 && code <= 255) {
      // Latin-1 / WinAnsi letters: á, é, í, ó, ú, ñ, etc.
      out += '\\' + code.toString(8).padStart(3, '0');
    } else {
      // Fallback: strip or space
      out += ' ';
    }
  }
  return out;
}

/**
 * Approximate string width calculation for Helvetica to center text.
 */
function estimateTextWidth(text: string, fontSize: number, bold = false): number {
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ' || ch === '.' || ch === ',') units += 280;
    else if ('ilI1|!;:'.includes(ch)) units += 300;
    else if ('mwMW'.includes(ch)) units += 850;
    else if (ch === ch.toUpperCase()) units += 700;
    else units += 530;
  }
  if (bold) units *= 1.08;
  return (units / 1000) * fontSize;
}

export function buildFdvc2026PreviewPdf(
  preview: Fdvc2026PreviewCase,
  previewVerifyUrl: string
): Buffer {
  const pageWidth = 842;
  const pageHeight = 595;

  // Colors in PDF RGB:
  // Burgundy #5C061E -> 0.361 0.024 0.118
  // Dark Red #8A1434 -> 0.541 0.078 0.204
  // Warm Gold #C5A880 -> 0.773 0.659 0.502
  // Charcoal #1C1A17 -> 0.110 0.102 0.090
  // Muted Stone #666059 -> 0.400 0.376 0.349
  // Light Stone #8C867E -> 0.549 0.525 0.494

  const streamParts: string[] = [];

  // 1. Background (Ivory #FCFBF7)
  streamParts.push('0.988 0.984 0.969 rg 0 0 842 595 re f');

  // 2. Framing Borders (Warm Gold #C5A880)
  // Outer border (36 pt margin)
  streamParts.push('0.773 0.659 0.502 RG 1.2 w 36 36 770 523 re S');
  // Inner fine border (42 pt margin)
  streamParts.push('0.773 0.659 0.502 RG 0.5 w 42 42 758 511 re S');

  // Decorative corner accents (small 6x6 squares at inner border corners)
  streamParts.push('0.773 0.659 0.502 rg');
  streamParts.push('39 39 6 6 re f');
  streamParts.push('797 39 6 6 re f');
  streamParts.push('39 550 6 6 re f');
  streamParts.push('797 550 6 6 re f');

  // 3. Header: Festival title & location
  const headerOrg = 'FESTIVAL NACIONAL DANZA DEL VIENTRE CHILE';
  const headerOrgWidth = estimateTextWidth(headerOrg, 12, true);
  const headerOrgX = (pageWidth - headerOrgWidth) / 2;
  streamParts.push(`BT /F2 12 Tf 0.361 0.024 0.118 rg ${headerOrgX.toFixed(1)} 518 Td (${escapeWinAnsi(headerOrg)}) Tj ET`);

  const headerSub = 'SANTIAGO  \\225  CHILE';
  const headerSubWidth = estimateTextWidth('SANTIAGO  •  CHILE', 8.5);
  const headerSubX = (pageWidth - headerSubWidth) / 2;
  streamParts.push(`BT /F1 8.5 Tf 0.400 0.376 0.349 rg ${headerSubX.toFixed(1)} 504 Td (${headerSub}) Tj ET`);

  // Thin gold divider under header
  streamParts.push('0.773 0.659 0.502 rg 271 494 300 0.75 re f');

  // 4. Certificate Type Title (e.g. "CERTIFICADO DE PARTICIPACIÓN" / "RECONOCIMIENTO")
  const certTitle = preview.certificateType;
  const certTitleWidth = estimateTextWidth(certTitle, 20, true);
  const certTitleX = (pageWidth - certTitleWidth) / 2;
  streamParts.push(`BT /F2 20 Tf 0.361 0.024 0.118 rg ${certTitleX.toFixed(1)} 456 Td (${escapeWinAnsi(certTitle)}) Tj ET`);

  // 5. Intro certification text
  const introLine1 = 'El Festival Nacional Danza del Vientre Chile';
  const introLine1Width = estimateTextWidth(introLine1, 11);
  const introLine1X = (pageWidth - introLine1Width) / 2;
  streamParts.push(`BT /F1 11 Tf 0.110 0.102 0.090 rg ${introLine1X.toFixed(1)} 420 Td (${escapeWinAnsi(introLine1)}) Tj ET`);

  const introLine2 = preview.certificateType === 'CERTIFICADO DE PARTICIPACIÓN'
    ? 'certifica la participación de'
    : preview.mode === 'group'
    ? 'otorga el presente reconocimiento a'
    : 'otorga el presente reconocimiento a';
  const introLine2Width = estimateTextWidth(introLine2, 11);
  const introLine2X = (pageWidth - introLine2Width) / 2;
  streamParts.push(`BT /F1 11 Tf 0.110 0.102 0.090 rg ${introLine2X.toFixed(1)} 405 Td (${escapeWinAnsi(introLine2)}) Tj ET`);

  // 6. Subject Name (Prominent, Elegant)
  const subjectName = preview.subject.displayName;
  const nameWidth = estimateTextWidth(subjectName, 26, true);
  const nameX = (pageWidth - nameWidth) / 2;
  streamParts.push(`BT /F2 26 Tf 0.361 0.024 0.118 rg ${nameX.toFixed(1)} 360 Td (${escapeWinAnsi(subjectName)}) Tj ET`);

  // 7. Middle section: Representation (if any) and Event details
  let currentY = 328;
  if (preview.organizationName) {
    const repText = 'representando a';
    const repWidth = estimateTextWidth(repText, 10.5);
    const repX = (pageWidth - repWidth) / 2;
    streamParts.push(`BT /F1 10.5 Tf 0.400 0.376 0.349 rg ${repX.toFixed(1)} ${currentY} Td (${escapeWinAnsi(repText)}) Tj ET`);
    currentY -= 18;

    const orgText = preview.organizationName;
    const orgWidth = estimateTextWidth(orgText, 14, true);
    const orgX = (pageWidth - orgWidth) / 2;
    streamParts.push(`BT /F2 14 Tf 0.110 0.102 0.090 rg ${orgX.toFixed(1)} ${currentY} Td (${escapeWinAnsi(orgText)}) Tj ET`);
    currentY -= 22;
  }

  const roleEventText = preview.family === 'guest'
    ? (preview.mode === 'group'
      ? 'por su participación como agrupación invitada'
      : 'por su participación como invitada')
    : 'en el Festival Nacional Danza del Vientre Chile 2026,';
  const roleEventWidth = estimateTextWidth(roleEventText, 11);
  const roleEventX = (pageWidth - roleEventWidth) / 2;
  streamParts.push(`BT /F1 11 Tf 0.110 0.102 0.090 rg ${roleEventX.toFixed(1)} ${currentY} Td (${escapeWinAnsi(roleEventText)}) Tj ET`);
  currentY -= 17;

  if (preview.family === 'guest') {
    const festNameLine = 'en el Festival Nacional Danza del Vientre Chile 2026,';
    const festNameWidth = estimateTextWidth(festNameLine, 11);
    const festNameX = (pageWidth - festNameWidth) / 2;
    streamParts.push(`BT /F1 11 Tf 0.110 0.102 0.090 rg ${festNameX.toFixed(1)} ${currentY} Td (${escapeWinAnsi(festNameLine)}) Tj ET`);
    currentY -= 17;
  }

  const datePlaceText = 'realizado el 5 de septiembre de 2026 en Ñuñoa, Santiago de Chile.';
  const datePlaceWidth = estimateTextWidth(datePlaceText, 11);
  const datePlaceX = (pageWidth - datePlaceWidth) / 2;
  streamParts.push(`BT /F1 11 Tf 0.110 0.102 0.090 rg ${datePlaceX.toFixed(1)} ${currentY} Td (${escapeWinAnsi(datePlaceText)}) Tj ET`);
  currentY -= 16;

  const venueText = 'Aula Magna, Liceo Experimental Manuel de Salas';
  const venueWidth = estimateTextWidth(venueText, 9.5);
  const venueX = (pageWidth - venueWidth) / 2;
  streamParts.push(`BT /F1 9.5 Tf 0.400 0.376 0.349 rg ${venueX.toFixed(1)} ${currentY} Td (${escapeWinAnsi(venueText)}) Tj ET`);

  // 8. Bottom Section
  // Left: Vector QR Code
  const qr = QRCode.create(previewVerifyUrl, { errorCorrectionLevel: 'M' });
  const qrModulesCount = qr.modules.size;
  const qrDisplaySize = 64; // pt
  const moduleSize = qrDisplaySize / qrModulesCount;
  const qrStartX = 62;
  const qrStartY = 72;

  // Background white box for QR code
  streamParts.push(`1 1 1 rg ${qrStartX - 4} ${qrStartY - 4} ${qrDisplaySize + 8} ${qrDisplaySize + 8} re f`);
  streamParts.push(`0.773 0.659 0.502 RG 0.5 w ${qrStartX - 4} ${qrStartY - 4} ${qrDisplaySize + 8} ${qrDisplaySize + 8} re S`);

  // Draw black modules as vector rects
  streamParts.push('0 0 0 rg');
  const qrRects: string[] = [];
  for (let r = 0; r < qrModulesCount; r++) {
    for (let c = 0; c < qrModulesCount; c++) {
      if (qr.modules.get(r, c)) {
        const mx = qrStartX + c * moduleSize;
        const my = qrStartY + (qrModulesCount - 1 - r) * moduleSize;
        qrRects.push(`${mx.toFixed(2)} ${my.toFixed(2)} ${moduleSize.toFixed(2)} ${moduleSize.toFixed(2)} re`);
      }
    }
  }
  streamParts.push(`${qrRects.join(' ')} f`);

  // Text next to QR code
  const qrTextX = qrStartX + qrDisplaySize + 14;
  streamParts.push(`BT /F2 8.5 Tf 0.110 0.102 0.090 rg ${qrTextX} 122 Td (${escapeWinAnsi('Verifica esta credencial en CulturaGO')}) Tj ET`);
  streamParts.push(`BT /F1 8 Tf 0.400 0.376 0.349 rg ${qrTextX} 108 Td (${escapeWinAnsi(`Código: ${preview.previewCode}`)}) Tj ET`);
  streamParts.push(`BT /F2 8 Tf 0.541 0.078 0.204 rg ${qrTextX} 94 Td (${escapeWinAnsi('[VISTA PREVIA \\227 AÚN NO EMITIDA]')}) Tj ET`);
  streamParts.push(`BT /F1 7.5 Tf 0.549 0.525 0.494 rg ${qrTextX} 80 Td (${escapeWinAnsi(`Presentación: ${preview.presentationCode}`)}) Tj ET`);

  // Right: Signature line & Festival Authority
  const sigLineX = 540;
  const sigLineWidth = 220;
  streamParts.push(`0.773 0.659 0.502 rg ${sigLineX} 118 ${sigLineWidth} 0.75 re f`);

  const sigTitle = 'Dirección y Organización';
  const sigTitleWidth = estimateTextWidth(sigTitle, 10, true);
  const sigTitleX = sigLineX + (sigLineWidth - sigTitleWidth) / 2;
  streamParts.push(`BT /F2 10 Tf 0.110 0.102 0.090 rg ${sigTitleX.toFixed(1)} 103 Td (${escapeWinAnsi(sigTitle)}) Tj ET`);

  const sigFest = 'Festival Nacional Danza del Vientre Chile';
  const sigFestWidth = estimateTextWidth(sigFest, 8.5);
  const sigFestX = sigLineX + (sigLineWidth - sigFestWidth) / 2;
  streamParts.push(`BT /F1 8.5 Tf 0.400 0.376 0.349 rg ${sigFestX.toFixed(1)} 90 Td (${escapeWinAnsi(sigFest)}) Tj ET`);

  // Bottom Center: CulturaGO verification platform statement
  const footerCulturaGo = 'Esta credencial forma parte del pasaporte cultural digital de CulturaGO \\225 Registro y verificación: culturago.cl';
  const footerWidth = estimateTextWidth('Esta credencial forma parte del pasaporte cultural digital de CulturaGO • Registro y verificación: culturago.cl', 7.5);
  const footerX = (pageWidth - footerWidth) / 2;
  streamParts.push(`BT /F1 7.5 Tf 0.549 0.525 0.494 rg ${footerX.toFixed(1)} 48 Td (${escapeWinAnsi(footerCulturaGo)}) Tj ET`);

  const contentStream = streamParts.join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj`,
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj',
    `6 0 obj << /Length ${Buffer.byteLength(contentStream, 'binary')} >> stream\n${contentStream}\nendstream endobj`,
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
