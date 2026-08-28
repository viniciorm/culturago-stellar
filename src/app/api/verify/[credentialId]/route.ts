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
  return NextResponse.json({
    ...view,
    network: config.environment,
    contractId: config.credentialRegistryContractId ?? event.contractId,
  });
}
