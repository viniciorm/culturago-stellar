import { PassportService } from '@/infrastructure/stellar/PassportService';

interface PageProps {
  params: Promise<{ subjectId: string }>;
  searchParams: Promise<{ eventId?: string }>;
}

export default async function PassportPage({ params, searchParams }: PageProps) {
  const { subjectId } = await params;
  const { eventId } = await searchParams;
  const passport = new PassportService();
  const entries = eventId ? await passport.getPassport(subjectId, eventId) : [];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Pasaporte cultural</h1>
        <p className="text-sm text-slate-400 mb-6">Sujeto: <span className="font-mono">{subjectId}</span></p>
        {!eventId ? (
          <p className="text-slate-400">Agregá ?eventId=… para ver la trayectoria de un evento.</p>
        ) : entries.length === 0 ? (
          <p className="text-slate-400">Sin credenciales indexadas para este sujeto/evento.</p>
        ) : (
          <ul className="space-y-4">
            {entries.map((entry) => (
              <li key={entry.credentialId} className="bg-slate-900 rounded-lg p-4 border border-slate-800">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-mono text-sm break-all">{entry.credentialId}</p>
                    <p className="text-xs text-slate-500 mt-1">Ledger {entry.ledger}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${entry.status === 'issued' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                    {entry.status}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <a href={`/verify/${entry.credentialId}`} className="text-xs text-slate-400 hover:text-slate-300">Verificar</a>
                  <a href={`/api/export/${entry.credentialId}/json`} className="text-xs text-slate-400 hover:text-slate-300">JSON</a>
                  <a href={`/api/export/${entry.credentialId}/qr`} className="text-xs text-slate-400 hover:text-slate-300">QR</a>
                  <a href={`/api/export/${entry.credentialId}/pdf`} className="text-xs text-slate-400 hover:text-slate-300">PDF</a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
