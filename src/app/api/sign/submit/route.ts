import { NextResponse } from 'next/server';
import { createStellarGateway } from '@/infrastructure/stellar/createStellarGateway';
import { assertTestnetHarnessAllowed } from '@/infrastructure/stellar/harnessGuard';
import { isDomainError } from '@/domain/errors';

export async function POST(request: Request) {
  try {
    await assertTestnetHarnessAllowed(request);
    const { operationId, signedXdr, signerAddress } = await request.json();
    const bundle = createStellarGateway();
    const state = await bundle.gateway.submitSigned(operationId, signedXdr, signerAddress);
    return NextResponse.json({ operation: state });
  } catch (error) {
    const status = isDomainError(error) ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'internal error' },
      { status }
    );
  }
}
