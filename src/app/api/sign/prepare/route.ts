import { NextResponse } from 'next/server';
import { createStellarGateway } from '@/infrastructure/stellar/createStellarGateway';
import {
  parseStrictJson,
  requireHarnessActor,
  validatePrepareCommand,
} from '@/infrastructure/harness/harnessHandler';
import { isDomainError } from '@/domain/errors';

export async function POST(request: Request) {
  try {
    const actor = await requireHarnessActor(request, {
      tokenEnvVar: 'CULTURAGO_TESTNET_HARNESS_TOKEN',
    });

    const { parsed } = await parseStrictJson(request);
    const command = validatePrepareCommand(parsed, actor.walletAddress!);

    const bundle = createStellarGateway();
    console.log('[/api/sign/prepare] command:', command);
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
    console.log('[/api/sign/prepare] state:', state);
    const prepared = await bundle.gateway.getPreparedPayload(state.operationId);
    return NextResponse.json({ operation: state, prepared });
  } catch (error) {
    const code = isDomainError(error) ? (error as { code: string }).code : undefined;
    const status =
      code === 'UNAUTHORIZED' ? 401 :
      code === 'RATE_LIMITED' ? 429 :
      isDomainError(error) ? 400 :
      500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'internal error' },
      { status }
    );
  }
}
