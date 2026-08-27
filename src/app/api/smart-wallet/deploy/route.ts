import 'server-only';
import { NextResponse } from 'next/server';
import { PasskeyServer } from 'passkey-kit/server';
import { requireActorFromSession } from '../../../../infrastructure/auth/getActorFromSession';
import { PostgreSQLIdentityStore } from '../../../../infrastructure/auth/PostgreSQLIdentityStore';
import { isPersistenceConfigured } from '../../../../infrastructure/config/env';
import { domainError, isDomainError } from '../../../../domain/errors';
import { getStellarNetworkConfig } from '../../../../infrastructure/stellar/networkConfig';
import { assertSmartWalletWasmAllowlist } from '../../../../infrastructure/stellar/SmartWalletAllowlist';

const identityStore = new PostgreSQLIdentityStore();

export async function POST(request: Request) {
  try {
    const actor = await requireActorFromSession();
    const body = (await request.json()) as {
      signedTx?: unknown;
      contractId?: unknown;
    };
    if (typeof body.signedTx !== 'string' || typeof body.contractId !== 'string') {
      throw domainError('INVALID_INPUT', 'signedTx and contractId are required');
    }
    const { signedTx, contractId } = body;

    const config = getStellarNetworkConfig();
    assertSmartWalletWasmAllowlist(signedTx, config.networkPassphrase, config.smartWalletWasmAllowlist);

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

    const result = await passkeyServer.send(signedTx, { skipWait: false });
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.message, code: result.error.code },
        { status: 500 }
      );
    }

    if (isPersistenceConfigured()) {
      await identityStore.updateAccountWalletContractAddress(actor.accountId, contractId);
    }

    return NextResponse.json({ success: true, txHash: result.hash, contractId });
  } catch (error) {
    const code = isDomainError(error) ? (error as { code: string }).code : undefined;
    const status = code === 'UNAUTHORIZED' ? 401 : isDomainError(error) ? 400 : 500;
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
