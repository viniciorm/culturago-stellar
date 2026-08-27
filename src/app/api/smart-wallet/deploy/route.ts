import 'server-only';
import { NextResponse } from 'next/server';
import { PasskeyServer } from 'passkey-kit/server';
import { domainError } from '../../../../domain/errors';
import { getStellarNetworkConfig } from '../../../../infrastructure/stellar/networkConfig';
import { assertTestnetHarnessAllowed } from '../../../../infrastructure/stellar/harnessGuard';
import { assertSmartWalletWasmAllowlist } from '../../../../infrastructure/stellar/SmartWalletAllowlist';

export async function POST(request: Request) {
  try {
    await assertTestnetHarnessAllowed(request);
    const body = (await request.json()) as { signedTx?: string };
    const { signedTx } = body;
    if (!signedTx || typeof signedTx !== 'string') {
      throw domainError('INVALID_INPUT', 'signedTx is required');
    }

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

    return NextResponse.json({ success: true, txHash: result.hash });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
