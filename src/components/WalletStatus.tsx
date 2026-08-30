'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet } from 'lucide-react';
import { Button } from './ui/Button';
import { PasskeyKitSigner } from '@/lib/smartWallet/PasskeyKitSigner';
import type { ActorContext } from '@/infrastructure/auth/actorContext';
import type { PasskeyKitConfig } from 'passkey-kit';

interface WalletStatusProps {
  actor: ActorContext;
}

function getPublicEnv() {
  return {
    rpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? '',
    networkPassphrase: process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? '',
    walletWasmHash: process.env.NEXT_PUBLIC_SMART_WALLET_WASM_HASH ?? '',
    acceptedWasmHashes: (process.env.NEXT_PUBLIC_SMART_WALLET_ACCEPTED_WASM_HASHES ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  };
}

export function WalletStatus({ actor }: WalletStatusProps) {
  const testWebAuthn =
    typeof window !== 'undefined'
      ? (window as unknown as { __culturagoWebAuthn?: PasskeyKitConfig['WebAuthn'] }).__culturagoWebAuthn
      : undefined;
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleCreate = async () => {
    setIsLoading(true);
    setMessage('Creando smart wallet con passkey...');
    try {
      const env = getPublicEnv();
      if (!env.rpcUrl || !env.networkPassphrase || !env.walletWasmHash) {
        throw new Error('Faltan variables públicas de Stellar / smart wallet');
      }

      const signer = new PasskeyKitSigner(
        env.rpcUrl,
        env.networkPassphrase,
        env.walletWasmHash,
        env.acceptedWasmHashes.length > 0 ? env.acceptedWasmHashes : [env.walletWasmHash],
        window.location.hostname,
        testWebAuthn
      );

      await signer.createWallet('CulturaGO', actor.accountId);
      setMessage('Smart wallet creada. Refrescando sesión...');
      router.refresh();
    } catch (error) {
      console.error('[WalletStatus] create wallet failed', error);
      setMessage(error instanceof Error ? error.message : 'Error creando smart wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const walletShort = actor.walletAddress
    ? `${actor.walletAddress.slice(0, 6)}...${actor.walletAddress.slice(-6)}`
    : null;

  return (
    <div className="border border-stone-200 rounded-xl bg-white p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-stone-700">
        <Wallet className="w-4 h-4 text-[#C5A880]" />
        Smart Wallet
      </div>

      {actor.walletAddress ? (
        <div className="text-xs text-stone-600 break-all" title={actor.walletAddress}>
          <span className="font-mono bg-stone-100 px-2 py-1 rounded">{walletShort}</span>
          <p className="mt-1 text-stone-500">Wallet lista para firmar operaciones.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-stone-500">
            No tenés una smart wallet on-chain vinculada. Creala con tu passkey para registrar entidades, emitir y revocar credenciales.
          </p>
          <Button variant="primary" size="sm" onClick={handleCreate} disabled={isLoading}>
            {isLoading ? 'Creando...' : 'Crear Smart Wallet'}
          </Button>
        </div>
      )}

      {message && (
        <p className="text-xs text-stone-600" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}
