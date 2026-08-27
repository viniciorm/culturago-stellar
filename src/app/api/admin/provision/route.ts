import 'server-only';
import { NextResponse } from 'next/server';
import { assertRole } from '../../../../infrastructure/auth/actorContext';
import { isPersistenceConfigured } from '../../../../infrastructure/config/env';
import { requireActorFromSession } from '../../../../infrastructure/auth/getActorFromSession';
import { PostgreSQLIdentityStore } from '../../../../infrastructure/auth/PostgreSQLIdentityStore';
import { PostgreSQLDatabaseGateway } from '../../../../infrastructure/database/PostgreSQLDatabaseGateway';
import { InMemoryOperationStore } from '../../../../infrastructure/stellar/InMemoryOperationStore';
import { PostgreSQLOperationStore } from '../../../../infrastructure/stellar/PostgreSQLOperationStore';
import {
  AdminProvisionOperation,
  ADMIN_PROVISION_OPERATIONS,
  createAdminStellarService,
} from '../../../../infrastructure/stellar/AdminStellarService';
import { CanonicalHashService } from '../../../../infrastructure/hashing/CanonicalHashService';
import { getStellarNetworkConfig } from '../../../../infrastructure/stellar/networkConfig';
import { domainError, isDomainError } from '../../../../domain/errors';
import {
  assertOriginAllowed,
  parseStrictJson,
} from '../../../../infrastructure/harness/harnessHandler';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const identityStore = new PostgreSQLIdentityStore();
const databaseGateway = new PostgreSQLDatabaseGateway();
const canonicalHash = new CanonicalHashService();

function isProvisionOperation(value: unknown): value is AdminProvisionOperation {
  return typeof value === 'string' && (ADMIN_PROVISION_OPERATIONS as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  try {
    const actor = await requireActorFromSession();
    assertRole(actor, 'admin');
    assertOriginAllowed(request);

    const { parsed } = await parseStrictJson(request);
    const body = parsed as Record<string, unknown>;
    const { accountId, issuerEntityId, operations } = body;

    if (typeof accountId !== 'string' || !UUID_RE.test(accountId)) {
      throw domainError('INVALID_INPUT', 'accountId must be a UUID');
    }
    if (typeof issuerEntityId !== 'string' || !UUID_RE.test(issuerEntityId)) {
      throw domainError('INVALID_INPUT', 'issuerEntityId must be a UUID');
    }
    if (!Array.isArray(operations) || operations.length === 0) {
      throw domainError('INVALID_INPUT', 'operations must be a non-empty array');
    }
    for (const op of operations) {
      if (!isProvisionOperation(op)) {
        throw domainError('INVALID_INPUT', `operation ${String(op)} is not in the admin allowlist`);
      }
    }

    const [account, issuer] = await Promise.all([
      identityStore.getAccount(accountId),
      databaseGateway.getEntityRecord(issuerEntityId),
    ]);

    if (!account) {
      throw domainError('NOT_FOUND', `account ${accountId} not found`);
    }
    if (account.status !== 'active') {
      throw domainError('UNAUTHORIZED', `account ${accountId} is not active`);
    }
    if (!account.walletContractAddress) {
      throw domainError('INVALID_INPUT', `account ${accountId} has no on-chain wallet address`);
    }
    if (!issuer) {
      throw domainError('NOT_FOUND', `issuer entity ${issuerEntityId} not found`);
    }

    const networkConfig = getStellarNetworkConfig();
    const store = isPersistenceConfigured() ? new PostgreSQLOperationStore() : new InMemoryOperationStore();
    const service = createAdminStellarService(networkConfig, store, canonicalHash);

    const results = await service.provision({
      operatorAddress: account.walletContractAddress,
      issuerEntityId,
      operations: operations as AdminProvisionOperation[],
    });

    // Keep the off-chain issuer_operators table in sync with on-chain links.
    for (const result of results) {
      if (result.phase === 'confirmed') {
        if (result.operation === 'link_issuer_operator') {
          await identityStore.linkIssuerOperator(issuerEntityId, accountId);
        } else if (result.operation === 'unlink_issuer_operator') {
          await identityStore.unlinkIssuerOperator(issuerEntityId, accountId);
        }
      }
    }

    console.log('[ADMIN_PROVISION_ENDPOINT]', {
      actorId: actor.accountId,
      accountId,
      issuerEntityId,
      operations,
      results: results.map(({ operation, phase, txHash, errorCode }) => ({
        operation,
        phase,
        txHash,
        errorCode,
      })),
    });

    return NextResponse.json({ success: true, results });
  } catch (error) {
    const code = isDomainError(error) ? (error as { code: string }).code : undefined;
    const status = code === 'UNAUTHORIZED' ? 401 : isDomainError(error) ? 400 : 500;
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
