import { redirect } from 'next/navigation';
import { isPersistenceConfigured, getPublicConfig } from '@/infrastructure/config/env';
import { getActorFromSession } from '@/infrastructure/auth/getActorFromSession';
import { assertRole } from '@/infrastructure/auth/actorContext';
import { listEntities, listCredentials } from '@/app/dashboard/credenciales/actions';
import { checkIn } from './actions';
import IssueCredentialForm from './IssueCredentialForm';
import RevokeCredentialForm from './RevokeCredentialForm';

interface PageProps {
  searchParams?: { ok?: string; error?: string };
}

export default async function OrganizerPanel({ searchParams }: PageProps) {
  const actor = await getActorFromSession();
  if (!actor) {
    redirect('/login');
  }
  assertRole(actor, 'admin', 'organizer', 'operator');

  const config = getPublicConfig();
  const persistence = isPersistenceConfigured();

  const message = searchParams?.ok ? `Acción completada: ${searchParams.ok}` : null;
  const error = searchParams?.error ? searchParams.error : null;

  const entities = persistence ? await listEntities() : [];
  const credentials = persistence ? await listCredentials() : [];

  const people = entities.filter((e) => e.type === 'person');
  const organizations = entities.filter((e) => e.type === 'organization');
  const events = entities.filter((e) => e.type === 'event');

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Panel del organizador</h1>
        <p className="text-slate-400 mb-6">
          Red: {config.environment} · Contrato credenciales: {config.credentialRegistryContractId ?? 'no configurado'}
        </p>

        {!persistence && (
          <div className="mb-6 p-4 bg-amber-900/30 border border-amber-700 rounded text-amber-100 text-sm">
            El panel del organizador requiere <code className="font-mono">DATABASE_URL</code> y las tablas de identidad (0002).
            Mientras tanto, usa las páginas de <em>Dashboard</em> para gestionar personas y credenciales.
          </div>
        )}

        {message && (
          <div className="mb-6 p-4 bg-emerald-900/30 border border-emerald-700 rounded text-emerald-100 text-sm">
            {message}
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded text-red-100 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 rounded-lg p-6">
            <h2 className="font-semibold mb-2">Check-in / Confirmar</h2>
            <p className="text-sm text-slate-400">Confirma la participación de una persona en un evento.</p>
            <form action={checkIn} className="mt-4 space-y-3">
              <select name="subjectId" required disabled={!persistence} className="w-full bg-slate-800 rounded p-2 text-sm disabled:opacity-50">
                <option value="">Sujeto (persona)</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name}</option>
                ))}
              </select>
              <select name="eventId" required disabled={!persistence} className="w-full bg-slate-800 rounded p-2 text-sm disabled:opacity-50">
                <option value="">Evento</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>{e.display_name}</option>
                ))}
              </select>
              <button type="submit" disabled={!persistence} className="w-full px-4 py-2 bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-50">
                Confirmar
              </button>
            </form>
          </div>

          <div className="bg-slate-900 rounded-lg p-6">
            <h2 className="font-semibold mb-2">Emitir credencial</h2>
            <p className="text-sm text-slate-400">Prepara y registra la emisión de una credencial.</p>
            <IssueCredentialForm
              environment={config.environment}
              walletAddress={actor.walletAddress ?? ''}
              people={people}
              organizations={organizations}
              events={events}
              disabled={!persistence}
            />
          </div>

          <div className="bg-slate-900 rounded-lg p-6">
            <h2 className="font-semibold mb-2">Revocar</h2>
            <p className="text-sm text-slate-400">Revoca una credencial vigente con motivo.</p>
            <RevokeCredentialForm
              environment={config.environment}
              walletAddress={actor.walletAddress ?? ''}
              credentials={credentials.map((c) => ({
                id: c.id,
                title: c.title,
                subject_name: c.subjectEntity?.display_name,
              }))}
              disabled={!persistence}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
