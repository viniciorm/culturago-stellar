import { NextResponse } from 'next/server';
import { createStellarGateway } from '@/infrastructure/stellar/createStellarGateway';
import { requireActorFromSession } from '@/infrastructure/auth/getActorFromSession';
import { isDomainError } from '@/domain/errors';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ operationId: string }> }
) {
  try {
    const actor = await requireActorFromSession();
    if (!actor.walletAddress) {
      return NextResponse.json(
        { error: 'actor has no on-chain wallet configured' },
        { status: 401 }
      );
    }

    const { operationId } = await params;
    const bundle = createStellarGateway();
    const op = await bundle.store.get(operationId);

    if (!op) {
      return NextResponse.json({ error: 'operation not found' }, { status: 404 });
    }

    if (op.intent.actorAddress !== actor.walletAddress) {
      return NextResponse.json(
        { error: 'operation does not belong to the actor' },
        { status: 401 }
      );
    }

    const state = await bundle.gateway.getOperation(operationId);
    return NextResponse.json({ operation: state });
  } catch (error) {
    const code = isDomainError(error) ? (error as { code: string }).code : undefined;
    const status = code === 'UNAUTHORIZED' ? 401 : isDomainError(error) ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'internal error' },
      { status }
    );
  }
}
