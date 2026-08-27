import { NextResponse } from 'next/server';
import { createStellarGateway } from '@/infrastructure/stellar/createStellarGateway';
import { requireActorFromSession } from '@/infrastructure/auth/getActorFromSession';
import { PostgreSQLDatabaseGateway } from '@/infrastructure/database/PostgreSQLDatabaseGateway';
import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { isDomainError, domainError } from '@/domain/errors';

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
    const actor = await requireActorFromSession();
    if (!actor.walletAddress) {
      throw domainError('UNAUTHORIZED', 'actor has no on-chain wallet configured');
    }

    const body = (await request.json()) as {
      operationId?: unknown;
      signedXdr?: unknown;
      signerAddress?: unknown;
    };
    if (
      typeof body.operationId !== 'string' ||
      typeof body.signedXdr !== 'string' ||
      typeof body.signerAddress !== 'string'
    ) {
      throw domainError('INVALID_INPUT', 'operationId, signedXdr and signerAddress are required');
    }

    const { operationId, signedXdr, signerAddress } = body;
    const bundle = createStellarGateway();

    const op = await bundle.store.get(operationId);
    if (!op) {
      throw domainError('NOT_FOUND', `operation ${operationId} not found`);
    }
    if (op.intent.actorAddress !== actor.walletAddress) {
      throw domainError('UNAUTHORIZED', 'signer address does not match the operation intent actor');
    }

    const state = await bundle.gateway.submitSigned(operationId, signedXdr, signerAddress);

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
    const status = code === 'UNAUTHORIZED' ? 401 : isDomainError(error) ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'internal error' },
      { status }
    );
  }
}
