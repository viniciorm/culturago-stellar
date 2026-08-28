import { NextResponse } from 'next/server';
import { createStellarGateway } from '@/infrastructure/stellar/createStellarGateway';
import { PostgreSQLDatabaseGateway } from '@/infrastructure/database/PostgreSQLDatabaseGateway';
import { getPublicConfig, isPersistenceConfigured } from '@/infrastructure/config/env';
import { isDomainError, domainError } from '@/domain/errors';
import { requireActorFromSession } from '@/infrastructure/auth/getActorFromSession';
import {
  assertOriginAllowed,
  assertRateLimit,
  assertRelayerBudget,
  parseStrictJson,
  validateSubmitBody,
} from '@/infrastructure/perimeter/perimeter';

const db = new PostgreSQLDatabaseGateway();

function assertTestnetMutationsAllowed(): void {
  const { environment } = getPublicConfig();
  if (environment === 'testnet' && process.env.CULTURAGO_ALLOW_TESTNET_MUTATIONS !== 'true') {
    throw domainError('UNAUTHORIZED', 'testnet mutations are disabled (CULTURAGO_ALLOW_TESTNET_MUTATIONS)');
  }
}

type ParsedIdempotencyKey =
  | { kind: 'register'; entityId: string }
  | { kind: 'issue'; credentialId: string }
  | { kind: 'revoke'; credentialId: string; reasonHash: string | null };

function parseIdempotencyKey(key: string): ParsedIdempotencyKey | null {
  const [prefix, ...rest] = key.split(':');
  if (prefix === 'register' && rest.length === 1) {
    return { kind: 'register', entityId: rest[0] };
  }
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
    assertOriginAllowed(request);
    const actor = await requireActorFromSession();
    await assertRateLimit(actor.accountId ?? actor.walletAddress!);
    assertTestnetMutationsAllowed();

    if (!actor.walletAddress) {
      throw domainError('UNAUTHORIZED', 'actor has no on-chain wallet configured');
    }

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
    if (body.signerAddress !== actor.walletAddress) {
      throw domainError('UNAUTHORIZED', 'submitted signer address does not match the actor wallet');
    }

    await assertRelayerBudget(actor.accountId ?? actor.walletAddress);
    const state = await bundle.gateway.submitSigned(
      body.operationId,
      body.signedXdr,
      body.signerAddress
    );

    if (state.phase === 'confirmed' && isPersistenceConfigured()) {
      const parsed = parseIdempotencyKey(state.idempotencyKey);
      if (parsed) {
        if (parsed.kind === 'register') {
          const record = await db.getEntityRecord(parsed.entityId);
          if (record) {
            const expected = op.intent.expected as
              | { metadataHash?: string; hashSchema?: number }
              | undefined;
            const nextVersion = record.latestVersion + 1;
            await db.saveEntityRecord({
              ...record,
              latestVersion: nextVersion,
              versions: [
                ...record.versions,
                {
                  version: nextVersion,
                  metadataHash: expected?.metadataHash ?? '',
                  hashSchema: expected?.hashSchema ?? 1,
                  registrarId: op.intent.actorAddress,
                  recordedAt: new Date().toISOString(),
                  recordedLedger: state.ledger,
                },
              ],
            });
          }
        } else if (parsed.kind === 'issue' || parsed.kind === 'revoke') {
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
