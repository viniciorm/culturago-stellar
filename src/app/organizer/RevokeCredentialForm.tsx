'use client';

import { useState, useTransition } from 'react';
import { revokeCredential } from './actions';
import type { OperationState } from '@/ports/StellarGateway';
import type { PreparedTransactionPayload } from '@/ports/SignerPort';

interface CredentialOption {
  id: string;
  title: string;
  subject_name?: string;
}

interface Props {
  environment: string;
  walletAddress: string;
  credentials: CredentialOption[];
  disabled?: boolean;
}

async function signAndSubmit(
  environment: string,
  walletAddress: string,
  operation: OperationState,
  prepared: PreparedTransactionPayload
): Promise<{ ok: boolean; message: string }> {
  if (environment !== 'demo') {
    return {
      ok: false,
      message: 'Firma con passkey (PasskeyKit) no está conectada en este ambiente.',
    };
  }

  const unsigned = JSON.parse(prepared.unsignedXdr) as { mode?: string; signature?: string | null };
  unsigned.mode = 'signed';
  unsigned.signature = 'client-sig';
  const signedXdr = JSON.stringify(unsigned);

  const res = await fetch('/api/sign/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      operationId: operation.operationId,
      signedXdr,
      signerAddress: walletAddress,
    }),
  });
  const body = (await res.json()) as { operation?: OperationState; error?: string };
  if (!res.ok) {
    return { ok: false, message: body.error ?? `HTTP ${res.status}` };
  }
  const phase = body.operation?.phase ?? 'unknown';
  return { ok: phase === 'confirmed', message: `Fase: ${phase} — ledger: ${body.operation?.ledger ?? 'n/a'}` };
}

export default function RevokeCredentialForm({
  environment,
  walletAddress,
  credentials,
  disabled,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [prepared, setPrepared] = useState<PreparedTransactionPayload | null>(null);
  const [operation, setOperation] = useState<OperationState | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = (await revokeCredential(formData)) as {
          success: true;
          operation: OperationState;
          prepared: PreparedTransactionPayload;
        };
        setOperation(result.operation);
        setPrepared(result.prepared);
        setStatus('Payload de revocación preparado. Confirmá para firmar y enviar.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Error preparando revocación');
      }
    });
  };

  const handleSign = async () => {
    if (!prepared || !operation) return;
    setStatus('Firmando y enviando...');
    const result = await signAndSubmit(environment, walletAddress, operation, prepared);
    setStatus(result.message);
    if (result.ok) {
      setPrepared(null);
      setOperation(null);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      <select name="credentialId" required disabled={disabled || isPending} className="w-full bg-slate-800 rounded p-2 text-sm disabled:opacity-50">
        <option value="">Credencial</option>
        {credentials.map((c) => (
          <option key={c.id} value={c.id}>{c.title} {c.subject_name ? `— ${c.subject_name}` : ''}</option>
        ))}
      </select>
      <input name="reason" placeholder="Motivo de revocación" disabled={disabled || isPending} className="w-full bg-slate-800 rounded p-2 text-sm disabled:opacity-50" />
      <button type="submit" disabled={disabled || isPending} className="w-full px-4 py-2 bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-50">
        Preparar revocación
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
