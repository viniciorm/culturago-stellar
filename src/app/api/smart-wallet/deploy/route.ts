import 'server-only';
import { NextResponse } from 'next/server';
import { PasskeyServer } from 'passkey-kit/server';
import { PostgreSQLIdentityStore } from '../../../../infrastructure/auth/PostgreSQLIdentityStore';
import { isPersistenceConfigured } from '../../../../infrastructure/config/env';
import { domainError, isDomainError } from '../../../../domain/errors';
import { getStellarNetworkConfig } from '../../../../infrastructure/stellar/networkConfig';
import { assertSmartWalletWasmAllowlist } from '../../../../infrastructure/stellar/SmartWalletAllowlist';
import {
  assertRelayerBudget,
  parseStrictJson,
  requireHarnessActor,
  validateDeployBody,
} from '../../../../infrastructure/harness/harnessHandler';

const identityStore = new PostgreSQLIdentityStore();

export async function POST(request: Request) {
  try {
    const actor = await requireHarnessActor(request, {
      tokenEnvVar: 'CULTURAGO_TESTNET_HARNESS_TOKEN',
    });
    const { parsed } = await parseStrictJson(request);
    const body = validateDeployBody(parsed);

    const config = getStellarNetworkConfig();
    assertSmartWalletWasmAllowlist(body.signedTx, config.networkPassphrase, config.smartWalletWasmAllowlist);

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

    assertRelayerBudget(actor.accountId ?? actor.walletAddress!);
    const result = await passkeyServer.send(body.signedTx, { skipWait: false });
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.message, code: result.error.code },
        { status: 500 }
      );
    }

    if (isPersistenceConfigured()) {
      await identityStore.updateAccountWalletContractAddress(actor.accountId, body.contractId);
    }

    return NextResponse.json({ success: true, txHash: result.hash, contractId: body.contractId });
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
