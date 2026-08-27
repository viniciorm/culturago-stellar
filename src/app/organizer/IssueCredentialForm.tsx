'use client';

import { useState, useTransition, useCallback } from 'react';
import { issueCredential } from './actions';
import { signAndSubmitOperation } from '@/lib/smartWallet/signAndSubmitOperation';
import { useOperationPoller } from '@/lib/hooks/useOperationPoller';
import { CREDENTIAL_TYPES } from '@/domain/credentials/catalog';
import type { OperationState } from '@/ports/StellarGateway';
import type { PreparedTransactionPayload } from '@/ports/SignerPort';

interface Option {
  id: string;
  display_name: string;
}

interface Props {
  environment: string;
  walletAddress: string;
  people: Option[];
  organizations: Option[];
  events: Option[];
  disabled?: boolean;
}

export default function IssueCredentialForm({
  environment,
  walletAddress,
  people,
  organizations,
  events,
  disabled,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [prepared, setPrepared] = useState<PreparedTransactionPayload | null>(null);
  const [operation, setOperation] = useState<OperationState | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const onOperationUpdate = useCallback(
    (op: OperationState) => {
      setOperation(op);
      setStatus(`Fase: ${op.phase} — ledger: ${op.ledger ?? 'n/a'}`);
      if (op.phase === 'confirmed' || op.phase === 'failed_terminal') {
        setPrepared(null);
      }
    },
    [setOperation, setStatus, setPrepared]
  );

  useOperationPoller(operation, onOperationUpdate);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = (await issueCredential(formData)) as {
          success: true;
          operation: OperationState;
          prepared: PreparedTransactionPayload;
        };
        setOperation(result.operation);
        setPrepared(result.prepared);
        setStatus('Payload preparado. Confirmá para firmar y enviar.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Error preparando emisión');
      }
    });
  };

  const handleSign = async () => {
    if (!prepared || !operation) return;
    setStatus('Firmando y enviando...');
    const result = await signAndSubmitOperation(environment, walletAddress, operation, prepared);
    setStatus(result.message);
    if (result.operation) {
      setOperation(result.operation);
    }
    if (result.ok) {
      setPrepared(null);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      <select name="issuerId" required disabled={disabled || isPending} className="w-full bg-slate-800 rounded p-2 text-sm disabled:opacity-50">
        <option value="">Organización emisora</option>
        {organizations.map((o) => (
          <option key={o.id} value={o.id}>{o.display_name}</option>
        ))}
      </select>
      <select name="subjectId" required disabled={disabled || isPending} className="w-full bg-slate-800 rounded p-2 text-sm disabled:opacity-50">
        <option value="">Sujeto (persona)</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>{p.display_name}</option>
        ))}
      </select>
      <select name="eventId" required disabled={disabled || isPending} className="w-full bg-slate-800 rounded p-2 text-sm disabled:opacity-50">
        <option value="">Evento</option>
        {events.map((e) => (
          <option key={e.id} value={e.id}>{e.display_name}</option>
        ))}
      </select>
      <select name="credentialType" required disabled={disabled || isPending} className="w-full bg-slate-800 rounded p-2 text-sm disabled:opacity-50">
        <option value="">Tipo de credencial</option>
        {Object.keys(CREDENTIAL_TYPES).map((type) => (
          <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
        ))}
      </select>
      <input name="title" placeholder="Título" required disabled={disabled || isPending} className="w-full bg-slate-800 rounded p-2 text-sm disabled:opacity-50" />
      <input name="description" placeholder="Descripción" disabled={disabled || isPending} className="w-full bg-slate-800 rounded p-2 text-sm disabled:opacity-50" />
      <input name="credentialCode" placeholder="Código (opcional, autogenerado si vacío)" disabled={disabled || isPending} className="w-full bg-slate-800 rounded p-2 text-sm disabled:opacity-50" />
      <button type="submit" disabled={disabled || isPending} className="w-full px-4 py-2 bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-50">
        Preparar
      </button>
      {prepared && (
        <button type="button" onClick={handleSign} disabled={disabled} className="w-full px-4 py-2 bg-emerald-700 rounded hover:bg-emerald-600 disabled:opacity-50">
          Firmar y enviar
        </button>
      )}
      {status && <p className="text-xs text-slate-300">{status}</p>}
    </form>
  );
}
