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
  return NextResponse.json({
    credentialId,
    status: event.eventType === 'CredentialRevoked' ? 'revoked' : 'issued',
    ledger: event.ledger,
    network: config.environment,
    contractId: config.credentialRegistryContractId ?? '',
    subjectId: event.subjectId,
    issuerId: event.issuerId,
    eventId: event.eventEntityId,
    data: event.data,
  });
}
