import { NextResponse } from 'next/server';
import { createStellarGateway } from '@/infrastructure/stellar/createStellarGateway';
import { PostgreSQLDatabaseGateway } from '@/infrastructure/database/PostgreSQLDatabaseGateway';
import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { isDomainError, domainError } from '@/domain/errors';
import {
  assertRelayerBudget,
  parseStrictJson,
  requireHarnessActor,
  validateSubmitBody,
} from '@/infrastructure/harness/harnessHandler';

const db = new PostgreSQLDatabaseGateway();

function parseIdempotencyKey(
  key: string
):
  | { kind: 'issue'; credentialId: string }
  | { kind: 'revoke'; credentialId: string; reasonHash: string | null }
  | null {
  const [prefix, ...rest] = key.split(':');
  if (prefix === 'issue' && rest.length === 1) {
    return { kind: 'issue', credentialId: rest[0] };
  }
  if (prefix === 'revoke' && rest.length >= 1) {
    return {
      kind: 'revoke',
      credentialId: rest[0],
      reasonHash: rest.slice(1).join(':') || null,
    };
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const actor = await requireHarnessActor(request, {
      tokenEnvVar: 'CULTURAGO_TESTNET_HARNESS_TOKEN',
    });

    const { parsed } = await parseStrictJson(request);
    const body = validateSubmitBody(parsed);

    const bundle = createStellarGateway();

    const op = await bundle.store.get(body.operationId);
    if (!op) {
      throw domainError('NOT_FOUND', `operation ${body.operationId} not found`);
    }
    if (op.intent.actorAddress !== actor.walletAddress) {
      throw domainError('UNAUTHORIZED', 'signer address does not match the operation intent actor');
    }

    assertRelayerBudget(actor.accountId ?? actor.walletAddress!);
    const state = await bundle.gateway.submitSigned(
      body.operationId,
      body.signedXdr,
      body.signerAddress
    );

    if (state.phase === 'confirmed' && isPersistenceConfigured()) {
      const parsed = parseIdempotencyKey(state.idempotencyKey);
      if (parsed) {
        const record = await db.getCredentialById(parsed.credentialId);
        if (record) {
          if (parsed.kind === 'issue') {
            record.issuedLedger = state.ledger;
          } else {
            record.revokedLedger = state.ledger;
            if (parsed.reasonHash) {
              record.revokedReasonHash = parsed.reasonHash;
            }
          }
          await db.saveCredential(record);
        }
      }
    }

    return NextResponse.json({ operation: state });
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
