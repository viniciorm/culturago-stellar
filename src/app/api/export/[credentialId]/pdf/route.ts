import { NextResponse } from 'next/server';
import { PassportService } from '@/infrastructure/stellar/PassportService';
import { getPublicConfig } from '@/infrastructure/config/env';

/**
 * Minimal text-only PDF export. No external dependency; the layout is
 * intentionally simple and accessible (screen-reader friendly text order).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ credentialId: string }> }
) {
  const { credentialId } = await params;
  const passport = new PassportService();
  const event = await passport.verifyIndexedCredential(credentialId);
  if (!event) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const config = getPublicConfig();
  const digest = typeof event.data.metadata_hash === 'string' ? event.data.metadata_hash : '';
  const hashSchema = typeof event.data.hash_schema === 'number' ? String(event.data.hash_schema) : '';
  const lines = [
    'CulturaGO — Credencial verificable',
    `Credencial: ${credentialId}`,
    `Estado: ${event.eventType === 'CredentialRevoked' ? 'Revocada' : 'Vigente'}`,
    `Ledger: ${event.ledger}`,
    `Red: ${config.environment}`,
    `Contrato: ${config.credentialRegistryContractId ?? ''}`,
    `Hash canónico: ${digest}`,
    `Esquema de hash: ${hashSchema}`,
  ];

  const pdf = buildSimplePdf(lines);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="credential-${credentialId}.pdf"`,
    },
  });
}

function buildSimplePdf(lines: string[]): Buffer {
  const text = lines.join('\\n');
  const stream = `BT /F1 12 Tf 50 750 Td 14 TL (${text}) Tj ET`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
  ];
  const header = '%PDF-1.4\n';
  let body = '';
  let offset = header.length;
  const xref: string[] = [];
  for (const obj of objects) {
    xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    body += obj + '\n';
    offset += obj.length + 1;
  }
  const xrefStart = offset;
  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  const xrefTable = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xref.join('')}`;
  return Buffer.from(header + body + xrefTable + trailer, 'utf-8');
}
