import { NextResponse } from 'next/server';
import { PassportService } from '@/infrastructure/stellar/PassportService';
import { getPublicConfig } from '@/infrastructure/config/env';

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
  const payload = {
    format: 'culturago.credential.v1',
    credentialId,
    status: event.eventType === 'CredentialRevoked' ? 'revoked' : 'issued',
    ledger: event.ledger,
    network: config.environment,
    contractId: config.credentialRegistryContractId ?? '',
    subjectId: event.subjectId,
    issuerId: event.issuerId,
    eventId: event.eventEntityId,
    data: event.data,
    canonical: {
      digest: event.data.metadata_hash ?? null,
      schema: event.data.hash_schema ?? null,
    },
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
