import { NextResponse } from 'next/server';
import { PassportService, toPublicCredentialView } from '@/infrastructure/stellar/PassportService';
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
  const view = toPublicCredentialView(event);
  const payload = {
    format: 'culturago.credential.v1',
    ...view,
    network: config.environment,
    contractId: config.credentialRegistryContractId ?? event.contractId,
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
