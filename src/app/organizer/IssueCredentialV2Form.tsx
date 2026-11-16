'use client';

import React, { useState, useTransition } from 'react';
import {
  issueParticipantCredentialV2FromOrganizer,
  type ConfirmedParticipationOption,
  type IssueParticipantV2OrganizerResult,
} from './credential-v2-actions';

interface Props {
  participations: ConfirmedParticipationOption[];
  disabled?: boolean;
}

export default function IssueCredentialV2Form({ participations, disabled }: Props) {
  const [isPending, startTransition] = useTransition();
  const [selectedParticipationId, setSelectedParticipationId] = useState<string>(
    participations[0]?.participationId ?? ''
  );
  const [participationMode, setParticipationMode] = useState<'solo' | 'group'>('solo');
  const [result, setResult] = useState<IssueParticipantV2OrganizerResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedOption = participations.find(
    (p) => p.participationId === selectedParticipationId
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setResult(null);

    if (!selectedOption) {
      setErrorMessage('Seleccioná una participación confirmada válida.');
      return;
    }

    startTransition(async () => {
      try {
        const res = await issueParticipantCredentialV2FromOrganizer({
          participationId: selectedOption.participationId,
          issuerEntityId: selectedOption.issuerEntityId,
          subjectEntityId: selectedOption.subjectEntityId,
          eventEntityId: selectedOption.eventEntityId,
          participationMode,
        });
        setResult(res);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Error al emitir credencial V2'
        );
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-amber-900/40 border border-amber-700/80 text-amber-200 text-xs font-medium">
        <span>Registro local — sin confirmación Stellar</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="v2-participation-select"
            className="block text-xs text-slate-400 mb-1"
          >
            Participación confirmada (Familia: Participant)
          </label>
          <select
            id="v2-participation-select"
            name="participationId"
            required
            value={selectedParticipationId}
            onChange={(e) => setSelectedParticipationId(e.target.value)}
            disabled={disabled || isPending || participations.length === 0}
            className="w-full bg-slate-800 rounded p-2 text-sm text-slate-100 disabled:opacity-50"
          >
            {participations.length === 0 ? (
              <option value="">Sin participaciones confirmadas en alcance</option>
            ) : (
              participations.map((p) => {
                const labelCode = p.presentationCode ? `[${p.presentationCode}] ` : '';
                const artistic = p.subjectArtisticName
                  ? ` ("${p.subjectArtisticName}")`
                  : '';
                return (
                  <option key={p.participationId} value={p.participationId}>
                    {labelCode}
                    {p.subjectDisplayName}
                    {artistic} — {p.eventName} (Emisor: {p.issuerDisplayName})
                  </option>
                );
              })
            )}
          </select>
        </div>

        <div>
          <label
            htmlFor="v2-participation-mode"
            className="block text-xs text-slate-400 mb-1"
          >
            Modalidad escénica
          </label>
          <select
            id="v2-participation-mode"
            name="participationMode"
            value={participationMode}
            onChange={(e) =>
              setParticipationMode(e.target.value === 'group' ? 'group' : 'solo')
            }
            disabled={disabled || isPending}
            className="w-full bg-slate-800 rounded p-2 text-sm text-slate-100 disabled:opacity-50"
          >
            <option value="solo">Solista (solo)</option>
            <option value="group">Participación Grupal (group)</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={disabled || isPending || !selectedOption}
          className="w-full px-4 py-2 bg-emerald-700 text-white rounded hover:bg-emerald-600 text-sm font-medium disabled:opacity-50"
        >
          {isPending ? 'Emitiendo Credencial V2...' : 'Emitir Credencial V2 (Participant)'}
        </button>
      </form>

      {errorMessage && (
        <div
          role="alert"
          className="p-3 rounded bg-red-950/60 border border-red-700 text-red-200 text-xs"
        >
          {errorMessage}
        </div>
      )}

      {result && (
        <div
          data-testid="v2-issuance-result"
          className="p-4 rounded-lg bg-slate-950 border border-slate-700 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-semibold text-emerald-300">
              Credencial V2 emitida: {result.credential.displayLabel} ({result.credential.displaySubtitle})
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-900/50 border border-amber-700 text-amber-200 font-medium">
              {result.publicStatusLabel}
            </span>
          </div>

          <div className="text-slate-300 space-y-1">
            <div>
              ID Público:{' '}
              <code className="font-mono text-slate-100">{result.credential.publicId}</code>
            </div>
            <div className="break-all">
              Digest SHA-256:{' '}
              <code className="font-mono text-slate-400">
                {result.credential.payloadDigest}
              </code>
            </div>
          </div>

          <div className="p-2.5 rounded bg-slate-900 border border-amber-800/60 text-amber-200/90 space-y-1">
            <div className="font-semibold">
              Gateway Simulado ({result.gateway.gatewayMode} · red: {result.gateway.network})
            </div>
            <div>{result.simulationNotice}</div>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <a
              href={result.passportHref}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium underline"
            >
              Ver pasaporte público
            </a>
            <a
              href={result.credentialHref}
              className="px-3 py-1.5 rounded bg-emerald-800 hover:bg-emerald-700 text-white font-medium underline"
            >
              Ver credencial pública V2
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
