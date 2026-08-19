import { getPublicConfig } from '@/infrastructure/config/env';

interface PageProps {
  params: Promise<{ credentialId: string }>;
}

export default async function VerifyPage({ params }: PageProps) {
  const { credentialId } = await params;
  const config = getPublicConfig();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Verificación de credencial</h1>
        <div className="bg-slate-900 rounded-lg p-6 space-y-4">
          <div>
            <p className="text-sm text-slate-400">Credencial</p>
            <p className="font-mono break-all">{credentialId}</p>
          </div>
          <div>
            <p className="text-sm text-slate-400">Red</p>
            <p>{config.environment}</p>
          </div>
          <div className="flex gap-4 pt-4">
            <a
              href={`/api/verify/${credentialId}`}
              className="px-4 py-2 bg-slate-800 rounded hover:bg-slate-700"
            >
              Ver JSON
            </a>
            <a
              href={`/api/export/${credentialId}/json`}
              className="px-4 py-2 bg-slate-800 rounded hover:bg-slate-700"
            >
              Exportar JSON
            </a>
            <a
              href={`/api/export/${credentialId}/qr`}
              className="px-4 py-2 bg-slate-800 rounded hover:bg-slate-700"
            >
              QR
            </a>
            <a
              href={`/api/export/${credentialId}/pdf`}
              className="px-4 py-2 bg-slate-800 rounded hover:bg-slate-700"
            >
              PDF
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
