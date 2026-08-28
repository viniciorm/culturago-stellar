'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialRequestOptionsJSON,
  type PublicKeyCredentialCreationOptionsJSON,
} from '@simplewebauthn/browser';
import { getPublicConfig } from '@/infrastructure/config/env';

function hasError(value: unknown): value is { error: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { error?: unknown }).error === 'string'
  );
}

/**
 * Login page.
 *
 * - Demo: no real authentication, explicit local-demo banner.
 * - Testnet/Mainnet: WebAuthn passkey login/registration against the server
 *   auth endpoints. Registration requires an existing account in the identity
 *   store; this UI only registers a passkey for that account.
 */
export default function LoginPage() {
  const { environment: env } = getPublicConfig();
  const router = useRouter();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [accountId, setAccountId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [claimCode, setClaimCode] = useState('');
  const [status, setStatus] = useState('');

  if (env === 'demo') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FCFBF7] text-[#1C1A17] p-4">
        <div className="max-w-md text-center space-y-4">
          <h2 className="font-serif text-2xl font-bold">Modo Demo Local</h2>
          <p className="text-sm text-stone-500">
            La autenticación con passkeys se activará en una etapa posterior. Por ahora,
            el portal público y el dashboard corren con datos simulados en este navegador.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5C061E] hover:underline"
          >
            Continuar al dashboard demo
            <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
          </Link>
        </div>
      </div>
    );
  }

  async function handleLogin() {
    setStatus('Iniciando autenticación...');
    try {
      const optionsRes = await fetch('/api/auth/login/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: accountId.trim() }),
      });
      const rawOptions = await optionsRes.json();
      if (!optionsRes.ok || hasError(rawOptions)) {
        throw new Error(hasError(rawOptions) ? rawOptions.error : 'No se pudieron obtener las opciones de login');
      }
      const options = rawOptions as unknown as PublicKeyCredentialRequestOptionsJSON;

      const response = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch('/api/auth/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      });
      const verify = await verifyRes.json();
      if (!verifyRes.ok || hasError(verify)) {
        throw new Error(hasError(verify) ? verify.error : 'Verificación de passkey fallida');
      }

      router.push('/dashboard');
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  async function handleRegister() {
    setStatus('Registrando passkey...');
    try {
      const code = claimCode.trim();
      if (!code) {
        throw new Error('Se requiere un código de invitación para registrar el primer passkey');
      }

      const claimRes = await fetch('/api/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const claim = await claimRes.json();
      if (!claimRes.ok || hasError(claim)) {
        throw new Error(hasError(claim) ? claim.error : 'Código de invitación inválido o expirado');
      }

      const optionsRes = await fetch('/api/auth/register/options', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: accountId.trim(),
          displayName: displayName.trim() || accountId.trim(),
        }),
      });
      const rawOptions = await optionsRes.json();
      if (!optionsRes.ok || hasError(rawOptions)) {
        throw new Error(hasError(rawOptions) ? rawOptions.error : 'No se pudieron obtener las opciones de registro');
      }
      const options = rawOptions as unknown as PublicKeyCredentialCreationOptionsJSON;

      const response = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch('/api/auth/register/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: accountId.trim(), response }),
      });
      const verify = await verifyRes.json();
      if (!verifyRes.ok || hasError(verify)) {
        throw new Error(hasError(verify) ? verify.error : 'Verificación de registro fallida');
      }

      setStatus('Passkey registrado. Ahora podés iniciar sesión.');
      setMode('login');
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FCFBF7] text-[#1C1A17] p-4">
      <div className="max-w-md w-full space-y-6">
        <h2 className="font-serif text-2xl font-bold text-center">Acceder con passkey</h2>
        <p className="text-sm text-stone-500 text-center">
          {env === 'testnet'
            ? 'Entorno Testnet: inicio de sesión con WebAuthn.'
            : 'Entorno Mainnet: inicio de sesión con WebAuthn.'}
        </p>

        <div className="flex gap-2 justify-center">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`px-4 py-2 text-sm font-semibold rounded ${
              mode === 'login'
                ? 'bg-[#5C061E] text-white'
                : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`px-4 py-2 text-sm font-semibold rounded ${
              mode === 'register'
                ? 'bg-[#5C061E] text-white'
                : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            Registrar passkey
          </button>
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-medium">
            ID de cuenta
            <input
              type="text"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded bg-white"
              placeholder="11111111-1111-1111-1111-111111111111"
            />
          </label>

          {mode === 'register' && (
            <>
              <label className="block text-sm font-medium">
                Nombre visible
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border rounded bg-white"
                  placeholder="Juan Pérez"
                />
              </label>
              <label className="block text-sm font-medium">
                Código de invitación
                <input
                  type="text"
                  value={claimCode}
                  onChange={(e) => setClaimCode(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border rounded bg-white"
                  placeholder="Pegá el código que recibiste"
                />
              </label>
            </>
          )}

          <button
            type="button"
            onClick={mode === 'login' ? handleLogin : handleRegister}
            className="w-full px-4 py-2 text-sm font-semibold text-white bg-[#5C061E] rounded hover:bg-[#4A0518]"
          >
            {mode === 'login' ? 'Iniciar sesión con passkey' : 'Registrar passkey'}
          </button>
        </div>

        {status && (
          <p className="text-sm text-center text-stone-600">{status}</p>
        )}
      </div>
    </div>
  );
}
