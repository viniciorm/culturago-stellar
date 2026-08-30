'use client';

import { PasskeyKitSigner } from './PasskeyKitSigner';
import type { OperationState } from '@/ports/StellarGateway';
import type { PreparedTransactionPayload } from '@/ports/SignerPort';

function getRpId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.location.hostname;
}

function getTestWebAuthn() {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __culturagoWebAuthn?: unknown }).__culturagoWebAuthn;
}

function getPublicEnv(): { rpcUrl: string; networkPassphrase: string; walletWasmHash: string; acceptedWasmHashes: string[] } {
  const rpcUrl = process.env.NEXT_PUBLIC_STELLAR_RPC_URL?.trim() ?? '';
  const networkPassphrase = process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE?.trim() ?? '';
  const walletWasmHash = process.env.NEXT_PUBLIC_SMART_WALLET_WASM_HASH?.trim() ?? '';
  const acceptedWasmHashes = (process.env.NEXT_PUBLIC_SMART_WALLET_ACCEPTED_WASM_HASHES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return { rpcUrl, networkPassphrase, walletWasmHash, acceptedWasmHashes };
}

/**
 * Firma y envía una operación preparada.
 *
 * - En `demo` usa la firma simulada del transporte en memoria.
 * - En `testnet`/`mainnet` exige passkey real a través de PasskeyKitSigner y
 *   rechaza cualquier intento de usar la firma fake fuera de demo.
 */
export async function signAndSubmitOperation(
  environment: string,
  walletAddress: string,
  operation: OperationState,
  prepared: PreparedTransactionPayload
): Promise<{ ok: boolean; message: string; operation?: OperationState }> {
  if (environment === 'demo') {
    try {
      const unsigned = JSON.parse(prepared.unsignedXdr) as { mode?: string; signature?: string | null };
      unsigned.mode = 'signed';
      unsigned.signature = 'client-sig';
      const signedXdr = JSON.stringify(unsigned);

      const res = await fetch('/api/sign/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operationId: operation.operationId,
          signedXdr,
          signerAddress: walletAddress,
        }),
      });
      const body = (await res.json()) as { operation?: OperationState; error?: string };
      if (!res.ok) {
        return { ok: false, message: body.error ?? `HTTP ${res.status}` };
      }
      const phase = body.operation?.phase ?? 'unknown';
      return {
        ok: phase === 'confirmed',
        message: `Fase: ${phase} — ledger: ${body.operation?.ledger ?? 'n/a'}`,
        operation: body.operation,
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Error firmando en demo' };
    }
  }

  if (!walletAddress) {
    return { ok: false, message: 'No hay una wallet on-chain configurada para firmar' };
  }

  const { rpcUrl, networkPassphrase, walletWasmHash, acceptedWasmHashes } = getPublicEnv();
  if (!rpcUrl || !networkPassphrase || !walletWasmHash) {
    return { ok: false, message: 'Faltan variables públicas de Stellar / smart wallet para la firma con passkey' };
  }

  const signer = new PasskeyKitSigner(
    rpcUrl,
    networkPassphrase,
    walletWasmHash,
    acceptedWasmHashes.length > 0 ? acceptedWasmHashes : [walletWasmHash],
    getRpId(),
    getTestWebAuthn() as ConstructorParameters<typeof PasskeyKitSigner>[5]
  );

  try {
    await signer.connectWallet(undefined, walletAddress);
    const signed = await signer.sign(prepared);

    // Rechazo explícito de firmas fake: el signer real debe devolver XDR base64.
    if (!signed.signedXdr || signed.signedXdr.startsWith('{')) {
      return { ok: false, message: 'Firma inválida: solo se aceptan transacciones firmadas por passkey' };
    }

    const res = await fetch('/api/sign/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operationId: operation.operationId,
        signedXdr: signed.signedXdr,
        signerAddress: signed.signerAddress,
      }),
    });
    const body = (await res.json()) as { operation?: OperationState; error?: string };
    if (!res.ok) {
      return { ok: false, message: body.error ?? `HTTP ${res.status}` };
    }
    const phase = body.operation?.phase ?? 'unknown';
    return {
      ok: phase === 'confirmed',
      message: `Fase: ${phase} — ledger: ${body.operation?.ledger ?? 'n/a'}`,
      operation: body.operation,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Error firmando con passkey' };
  }
}
