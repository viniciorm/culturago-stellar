import { NextResponse } from 'next/server';
import { createStellarGateway } from '@/infrastructure/stellar/createStellarGateway';
import { isDomainError } from '@/domain/errors';

export async function POST(request: Request) {
  try {
    const command = await request.json();
    const bundle = createStellarGateway();
    let state;
    switch (command.kind) {
      case 'register_entity':
        state = await bundle.gateway.prepareRegisterEntity(command);
        break;
      case 'issue_credential':
        state = await bundle.gateway.prepareIssueCredential(command);
        break;
      case 'revoke_credential':
        state = await bundle.gateway.prepareRevokeCredential(command);
        break;
      default:
        return NextResponse.json({ error: 'unknown operation kind' }, { status: 400 });
    }
    const prepared = await bundle.gateway.getPreparedPayload(state.operationId);
    return NextResponse.json({ operation: state, prepared });
  } catch (error) {
    const status = isDomainError(error) ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'internal error' },
      { status }
    );
  }
}
