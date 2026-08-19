import { getPublicConfig } from '@/infrastructure/config/env';

export default function OrganizerPanel() {
  const config = getPublicConfig();
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Panel del organizador</h1>
        <p className="text-slate-400 mb-6">
          Red: {config.environment} · Contrato credenciales: {config.credentialRegistryContractId ?? 'no configurado'}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 rounded-lg p-6">
            <h2 className="font-semibold mb-2">Check-in</h2>
            <p className="text-sm text-slate-400">Confirmar participación de una persona en un evento.</p>
            <button className="mt-4 px-4 py-2 bg-slate-800 rounded hover:bg-slate-700 w-full">Confirmar</button>
          </div>
          <div className="bg-slate-900 rounded-lg p-6">
            <h2 className="font-semibold mb-2">Emitir credencial</h2>
            <p className="text-sm text-slate-400">Preparar y firmar con consentimiento la emisión.</p>
            <button className="mt-4 px-4 py-2 bg-slate-800 rounded hover:bg-slate-700 w-full">Preparar</button>
          </div>
          <div className="bg-slate-900 rounded-lg p-6">
            <h2 className="font-semibold mb-2">Revocar</h2>
            <p className="text-sm text-slate-400">Revocar una credencial vigente con consentimiento.</p>
            <button className="mt-4 px-4 py-2 bg-slate-800 rounded hover:bg-slate-700 w-full">Revocar</button>
          </div>
        </div>
      </div>
    </main>
  );
}
