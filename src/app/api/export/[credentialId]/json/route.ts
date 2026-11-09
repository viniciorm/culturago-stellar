import { NextResponse } from 'next/server';
import { PassportService, toPublicCredentialView } from '@/infrastructure/stellar/PassportService';
import { verifyCredentialOnChain } from '@/app/actions';
import { getPublicConfig } from '@/infrastructure/config/env';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ credentialId: string }> }
) {
  const { credentialId } = await params;
  const config = getPublicConfig();
  const passport = new PassportService();
  const event = await passport.verifyIndexedCredential(credentialId);

  if (event) {
    const view = toPublicCredentialView(event);
    const payload = {
      format: 'culturago.credential.v1',
      ...view,
      credentialId,
      network: config.environment,
      contractId: config.credentialRegistryContractId ?? event.contractId,
    };
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const chainResult = await verifyCredentialOnChain(credentialId);
  if (chainResult.status === 'not_found') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const verifiedOnChain = Boolean(chainResult.exists && chainResult.matches);
  const payload = {
    format: 'culturago.credential.v1',
    credentialId: chainResult.credentialId,
    status: chainResult.status,
    dbStatus: chainResult.dbStatus ?? null,
    verifiedOnChain,
    onChain: {
      exists: chainResult.exists,
      matches: chainResult.matches,
      revoked: chainResult.revoked,
      ledger: chainResult.ledger,
    },
    ledger: chainResult.ledger,
    network: chainResult.network,
    contractId: chainResult.contractId ?? '',
    canonical: {
      digest: chainResult.metadataHash ?? null,
      schema: chainResult.hashSchema ?? null,
    },
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
