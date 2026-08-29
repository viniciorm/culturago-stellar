import { verifyCredentialOnChain } from '@/app/actions';

interface PageProps {
  params: Promise<{ credentialId: string }>;
}

export default async function VerifyPage({ params }: PageProps) {
  const { credentialId } = await params;

  let result;
  let error = null;
  try {
    result = await verifyCredentialOnChain(credentialId);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al verificar credencial';
    result = null;
  }

  const statusLabel =
    result?.status === 'issued'
      ? 'Vigente'
      : result?.status === 'revoked'
      ? 'Revocada'
      : 'No encontrada';

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Verificación de credencial</h1>
        {error ? (
          <div className="bg-red-900/30 border border-red-700 rounded p-4 text-red-100 mb-4">
            {error}
          </div>
        ) : null}
        {result ? (
          <div className="bg-slate-900 rounded-lg p-6 space-y-4">
            <div>
              <p className="text-sm text-slate-400">Credencial</p>
              <p className="font-mono break-all">{credentialId}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Estado en contrato</p>
              <p
                className={`text-lg font-bold ${
                  result.status === 'issued'
                    ? 'text-emerald-400'
                    : result.status === 'revoked'
                    ? 'text-rose-400'
                    : 'text-stone-400'
                }`}
              >
                {statusLabel}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Registrada en Stellar</p>
              <p>{result.exists ? 'Sí' : 'No'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Hash coincide</p>
              <p>{result.matches ? 'Sí' : 'No'}</p>
            </div>
            {result.ledger ? (
              <div>
                <p className="text-sm text-slate-400">Ledger</p>
                <p className="font-mono">{result.ledger}</p>
              </div>
            ) : null}
            <div>
              <p className="text-sm text-slate-400">Red</p>
              <p>{result.network}</p>
            </div>
            {result.contractId ? (
              <div>
                <p className="text-sm text-slate-400">Contrato</p>
                <p className="font-mono break-all">{result.contractId}</p>
              </div>
            ) : null}
            <div className="flex gap-4 pt-4 border-t border-slate-800">
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
        ) : (
          <div className="bg-slate-900 rounded-lg p-6 text-slate-400">
            No se pudo verificar la credencial.
          </div>
        )}
      </div>
    </main>
  );
}
