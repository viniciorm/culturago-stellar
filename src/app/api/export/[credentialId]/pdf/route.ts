import { NextResponse } from 'next/server';
import { PassportService } from '@/infrastructure/stellar/PassportService';
import { verifyCredentialOnChain } from '@/app/actions';
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
  const config = getPublicConfig();
  const passport = new PassportService();
  const event = await passport.verifyIndexedCredential(credentialId);

  let lines: string[];

  if (event) {
    const digest = typeof event.data.metadata_hash === 'string' ? event.data.metadata_hash : '';
    const hashSchema = typeof event.data.hash_schema === 'number' ? String(event.data.hash_schema) : '';
    const isRevoked = event.eventType === 'CredentialRevoked';
    lines = [
      'CulturaGO - Registro de credencial V1',
      `Credencial: ${credentialId}`,
      `Estado en Stellar: ${isRevoked ? 'Revocada en contrato' : 'Confirmada en contrato'}`,
      `Ledger: ${event.ledger}`,
      `Red: ${config.environment}`,
      `Contrato: ${config.credentialRegistryContractId ?? event.contractId}`,
      `Hash canonico: ${digest}`,
      `Esquema de hash: ${hashSchema}`,
    ];
  } else {
    const chainResult = await verifyCredentialOnChain(credentialId);
    if (chainResult.status === 'not_found') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const verifiedOnChain = Boolean(chainResult.exists && chainResult.matches);
    const statusLabel =
      chainResult.status === 'revoked'
        ? 'Revocada'
        : verifiedOnChain
        ? 'Confirmada en Stellar'
        : 'Sin confirmacion en Stellar (registro local)';

    lines = [
      'CulturaGO - Registro de credencial V1',
      `Credencial: ${chainResult.credentialId}`,
      `Estado de verificacion: ${statusLabel}`,
      `Estado local DB: ${chainResult.dbStatus ?? 'desconocido'}`,
      `Registrada en Stellar: ${chainResult.exists ? 'Si' : 'No'}`,
      `Hash verificado en contrato: ${chainResult.matches ? 'Si' : 'No'}`,
      `Ledger: ${chainResult.ledger ?? 'Sin confirmar'}`,
      `Red: ${chainResult.network}`,
      `Contrato: ${chainResult.contractId ?? ''}`,
      `Hash canonico: ${chainResult.metadataHash ?? ''}`,
      `Esquema de hash: ${chainResult.hashSchema ?? ''}`,
    ];
  }

  const pdf = buildSimplePdf(lines);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="credential-${credentialId}.pdf"`,
    },
  });
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildSimplePdf(lines: string[]): Buffer {
  const contentOps = lines
    .map((line, idx) => `${idx === 0 ? '' : 'T* '}(${escapePdfText(line)}) Tj`)
    .join('\n');
  const stream = `BT\n/F1 11 Tf\n50 750 Td\n16 TL\n${contentOps}\nET`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(stream, 'utf-8')} >> stream\n${stream}\nendstream endobj`,
  ];
  const header = '%PDF-1.4\n';
  let body = '';
  let offset = Buffer.byteLength(header, 'utf-8');
  const xref: string[] = [];
  for (const obj of objects) {
    xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    body += obj + '\n';
    offset += Buffer.byteLength(obj + '\n', 'utf-8');
  }
  const xrefStart = offset;
  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  const xrefTable = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xref.join('')}`;
  return Buffer.from(header + body + xrefTable + trailer, 'utf-8');
}
