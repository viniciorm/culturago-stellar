import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getPublicConfig } from '@/infrastructure/config/env';
import LoginClient from './LoginClient';

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

  return <LoginClient env={env} />;
}
