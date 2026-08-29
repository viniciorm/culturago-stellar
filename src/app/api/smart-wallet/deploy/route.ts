import 'server-only';
import { NextResponse } from 'next/server';
import { PasskeyServer } from 'passkey-kit/server';
import { createAuthBundle } from '@/infrastructure/auth/factory';
import { getPublicConfig, isPersistenceConfigured } from '@/infrastructure/config/env';
import { domainError, isDomainError } from '@/domain/errors';
import { requireActorFromSession } from '@/infrastructure/auth/getActorFromSession';
import { getStellarNetworkConfig } from '@/infrastructure/stellar/networkConfig';
import {
  assertSmartWalletContractAddress,
  assertSmartWalletWasmAllowlist,
} from '@/infrastructure/stellar/SmartWalletAllowlist';
import {
  assertOriginAllowed,
  assertRateLimit,
  assertRelayerBudget,
  parseStrictJson,
  validateDeployBody,
} from '@/infrastructure/perimeter/perimeter';

function assertTestnetMutationsAllowed(): void {
  const { environment } = getPublicConfig();
  if (environment === 'testnet' && process.env.CULTURAGO_ALLOW_TESTNET_MUTATIONS !== 'true') {
    throw domainError('UNAUTHORIZED', 'testnet mutations are disabled (CULTURAGO_ALLOW_TESTNET_MUTATIONS)');
  }
}

export async function POST(request: Request) {
  try {
    assertOriginAllowed(request);
    const actor = await requireActorFromSession();
    await assertRateLimit(actor.accountId);
    assertTestnetMutationsAllowed();

    const { parsed } = await parseStrictJson(request);
    const body = validateDeployBody(parsed);

    const config = getStellarNetworkConfig();
    assertSmartWalletWasmAllowlist(body.signedTx, config.networkPassphrase, config.smartWalletWasmAllowlist);
    const derivedContractId = assertSmartWalletContractAddress(
      body.signedTx,
      config.networkPassphrase,
      body.contractId
    );

    const baseUrl = process.env.SMART_WALLET_RELAYER_BASE_URL;
    const apiKey = process.env.SMART_WALLET_RELAYER_API_KEY;
    if (!baseUrl || !apiKey) {
      throw domainError('INVALID_INPUT', 'smart wallet relayer is not configured');
    }

    const passkeyServer = new PasskeyServer({
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      relayer: { baseUrl, apiKey },
    });

    await assertRelayerBudget(actor.accountId);
    const result = await passkeyServer.send(body.signedTx, { skipWait: false });
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.message, code: result.error.code },
        { status: 500 }
      );
    }

    const { store } = createAuthBundle();
    if (isPersistenceConfigured() || getPublicConfig().environment === 'demo') {
      await store.updateAccountWalletContractAddress(actor.accountId, derivedContractId);
      const account = await store.getAccount(actor.accountId);
      if (account?.personEntityId) {
        await store.upsertWallet({
          entityId: account.personEntityId,
          walletAddress: derivedContractId,
          walletType: 'passkey',
          walletStatus: 'claimed',
          claimedAt: new Date(),
        });
        await store.saveSmartWalletClaim({
          accountId: actor.accountId,
          entityId: account.personEntityId,
          contractId: derivedContractId,
          keyId: body.keyId ?? null,
          walletWasmHash: body.walletWasmHash ?? null,
          network: getPublicConfig().environment,
          deployTxHash: result.hash,
          deployedAt: new Date(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      txHash: result.hash,
      contractId: derivedContractId,
      walletStatus: 'claimed',
    });
  } catch (error) {
    const code = isDomainError(error) ? (error as { code: string }).code : undefined;
    const status =
      code === 'UNAUTHORIZED' ? 401 :
      code === 'RATE_LIMITED' ? 429 :
      isDomainError(error) ? 400 :
      500;
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
