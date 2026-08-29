'use client';

import React, { useState, useEffect } from 'react';
import {
  Cpu,
  CheckCircle,
  AlertCircle,
  FileCode,
  Globe,
  Loader2,
  Copy,
  RefreshCw
} from 'lucide-react';
import type { Entity, Credential } from '@/domain/types/entities';
import type { OperationState } from '@/ports/StellarGateway';
import { useOperationPoller } from '@/lib/hooks/useOperationPoller';
import { Button } from './ui/Button';

interface StellarStatusBlockProps {
  entity?: Entity | null;
  credential?: Credential | null;
  operation?: OperationState | null;
  onUpdate?: () => void;
  onPrepare?: () => Promise<void>;
  onSubmit?: () => Promise<void>;
  onReconcile?: () => Promise<void>;
}

export const StellarStatusBlock: React.FC<StellarStatusBlockProps> = ({
  entity,
  credential,
  operation,
  onUpdate,
  onPrepare,
  onSubmit,
  onReconcile,
}) => {
  const [currentOp, setCurrentOp] = useState<OperationState | null>(operation ?? null);
  const [loading, setLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (operation) {
      setCurrentOp((prev) => (prev && prev.operationId === operation.operationId ? prev : operation));
    }
  }, [operation]);

  useOperationPoller(currentOp, (op) => {
    setCurrentOp(op);
    if (op.phase === 'confirmed' || op.phase === 'failed_terminal') {
      onUpdate?.();
    }
  });

  const target = entity || credential;
  if (!target) return null;

  const isEntity = !!entity;
  const stellarStatus = target.stellar_status;
  const walletStatus = isEntity ? (entity?.wallet_status || 'none') : null;
  const walletAddress = isEntity ? (entity?.wallet_address || null) : null;
  const metadataHash = target.metadata_hash;
  const stellarTx = target.stellar_tx;

  const phase = currentOp?.phase;

  const statusLabels: Record<string, string> = {
    not_registered: 'No registrado',
    pending: 'Pendiente de firma',
    registered: 'Registrado',
    failed: 'Fallido',
  };

  const phaseLabels: Record<string, { label: string; copy: string; action: string }> = {
    awaiting_signature: { label: 'Esperando firma', copy: 'La operación fue preparada y debe ser firmada por el operador.', action: 'Firmar y enviar' },
    signed: { label: 'Firmada', copy: 'La transacción firmada se encuentra en cola de envío.', action: 'Enviar' },
    submitted: { label: 'Enviada', copy: 'La transacción fue enviada a la red. Esperando confirmación del ledger.', action: 'Consultando' },
    confirming: { label: 'Confirmando', copy: 'La transacción está siendo confirmada por el ledger.', action: 'Consultando' },
    confirmed: { label: 'Confirmada', copy: 'La transacción fue incluida en el ledger y el readback coincide.', action: 'Confirmada' },
    failed_retryable: { label: 'Fallo recuperable', copy: 'La operación no pudo completarse. Se puede intentar nuevamente.', action: 'Reintentar' },
    failed_terminal: { label: 'Fallo terminal', copy: 'La operación falló y no admite reintento. Copiá el correlation ID para soporte.', action: 'Soporte' },
    unknown: { label: 'Estado desconocido', copy: 'La red aún no responde. Se reconciliará automáticamente.', action: 'Reconciliar' },
    restoring: { label: 'Restaurando', copy: 'El contrato requiere restauración antes de continuar.', action: 'Restaurando' },
  };

  const reconcilablePhases = new Set(['failed_retryable', 'unknown', 'restoring']);

  const handleCopyCorrelation = () => {
    if (!currentOp) return;
    void navigator.clipboard.writeText(currentOp.operationId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleReconcile = async () => {
    if (!onReconcile) return;
    setReconciling(true);
    setError(null);
    try {
      await onReconcile();
      onUpdate?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al reconciliar la operación');
    } finally {
      setReconciling(false);
    }
  };

  const handlePrepare = async () => {
    if (!onPrepare) return;
    setLoading(true);
    setError(null);
    try {
      await onPrepare();
      if (onUpdate) onUpdate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al preparar la operación Stellar');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!onSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit();
      if (onUpdate) onUpdate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al firmar y enviar la operación Stellar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#FCFBF7] border border-stone-200/80 rounded-xl p-5 shadow-xs">
      <div className="flex items-center gap-2 border-b border-stone-200/60 pb-3 mb-4">
        <Cpu className="w-5 h-5 text-[#C5A880]" />
        <div>
          <h3 className="text-sm font-bold text-[#1C1A17]">Capa de Verificación Stellar</h3>
          <p className="text-[10px] text-stone-500 font-medium">Parámetros técnicos de blockchain para Danilo</p>
        </div>
      </div>

      <div className="space-y-4 text-xs">
        {/* Stellar Status */}
        <div className="border-b border-stone-100 pb-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-stone-600">Estado de Registro:</span>
            <div className="flex items-center gap-1.5">
              {stellarStatus === 'registered' ? (
                <span className="inline-flex items-center text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  {statusLabels.registered}
                </span>
              ) : stellarStatus === 'pending' ? (
                <span className="inline-flex items-center text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded">
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  {statusLabels.pending}
                </span>
              ) : stellarStatus === 'failed' ? (
                <span className="inline-flex items-center text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded">
                  <AlertCircle className="w-3.5 h-3.5 mr-1" />
                  {statusLabels.failed}
                </span>
              ) : (
                <span className="text-stone-500 bg-stone-100 px-2 py-0.5 rounded font-medium">
                  {statusLabels.not_registered}
                </span>
              )}
            </div>
          </div>
          {phase && phaseLabels[phase] && (
            <p className="text-[10px] text-stone-500 mt-1.5 leading-relaxed">
              <span className="font-semibold text-stone-600">{phaseLabels[phase].label}:</span>{' '}
              {phaseLabels[phase].copy}
            </p>
          )}
        </div>

        {/* Metadata Hash */}
        <div className="flex flex-col gap-1 border-b border-stone-100 pb-2">
          <span className="font-semibold text-stone-600">Hash de Metadata:</span>
          {metadataHash ? (
            <div className="flex items-center gap-1.5 font-mono text-[10px] bg-stone-100 p-1.5 rounded select-all break-all text-stone-600 border border-stone-200">
              <FileCode className="w-3.5 h-3.5 text-stone-400" />
              {metadataHash}
            </div>
          ) : (
            <span className="text-stone-400 italic">No generado</span>
          )}
        </div>

        {/* Tx Hash */}
        <div className="flex flex-col gap-1 border-b border-stone-100 pb-2">
          <span className="font-semibold text-stone-600">Hash Transaccional (tx_hash):</span>
          {stellarTx ? (
            <div className="flex items-center justify-between gap-1.5 font-mono text-[10px] bg-stone-100 p-1.5 rounded select-all break-all text-stone-600 border border-stone-200">
              <span className="truncate">{stellarTx}</span>
              <a 
                href={`https://stellar.expert/explorer/testnet/tx/${stellarTx}`}
                target="_blank"
                rel="noreferrer"
                className="text-[#5C061E] hover:underline flex items-center gap-0.5 shrink-0"
              >
                <Globe className="w-3 h-3" />
                Explorador
              </a>
            </div>
          ) : (
            <span className="text-stone-400 italic">Sin transacción asociada</span>
          )}
        </div>

        {/* Wallets (Only for entities, not credentials) */}
        {isEntity && (
          <>
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <span className="font-semibold text-stone-600">Estado de Wallet:</span>
              <span className="capitalize font-medium text-stone-700 bg-stone-150 px-2 py-0.5 rounded">
                {walletStatus === 'claimed' ? 'Reclamada' 
                 : walletStatus === 'reserved' ? 'Reservada (Passkey)' 
                 : 'Sin wallet'}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-semibold text-stone-600">Dirección de Wallet (wallet_address):</span>
              {walletAddress ? (
                <div className="font-mono text-[10px] bg-stone-100 p-1.5 rounded select-all break-all text-stone-600 border border-stone-200">
                  {walletAddress}
                </div>
              ) : (
                <span className="text-stone-400 italic">No asignada</span>
              )}
            </div>
          </>
        )}

        {/* Correlation ID */}
        {currentOp && (
          <div className="flex flex-col gap-1 border-b border-stone-100 pb-2">
            <span className="font-semibold text-stone-600">Correlation ID:</span>
            <div className="flex items-center justify-between gap-1.5 font-mono text-[10px] bg-stone-100 p-1.5 rounded select-all break-all text-stone-600 border border-stone-200">
              <span className="truncate">{currentOp.operationId}</span>
              <button
                type="button"
                onClick={handleCopyCorrelation}
                className="shrink-0 text-[#5C061E] hover:underline flex items-center gap-0.5"
                disabled={copied}
              >
                {copied ? 'Copiado' : <><Copy className="w-3 h-3" /> Copiar</>}
              </button>
            </div>
          </div>
        )}

        {/* Action block keyed to operation phase */}
        <div className="pt-3 space-y-2">
          {onPrepare && (!phase || stellarStatus === 'not_registered') && (
            <Button
              variant="primary"
              size="sm"
              className="w-full text-xs font-semibold"
              onClick={handlePrepare}
              isLoading={loading}
              disabled={loading}
            >
              <Cpu className="w-3.5 h-3.5 mr-1" />
              Preparar operación Stellar
            </Button>
          )}

          {onSubmit && phase === 'awaiting_signature' && (
            <Button
              variant="primary"
              size="sm"
              className="w-full text-xs font-semibold"
              onClick={handleSubmit}
              isLoading={loading}
              disabled={loading}
            >
              <Cpu className="w-3.5 h-3.5 mr-1" />
              Firmar y enviar
            </Button>
          )}

          {onReconcile && phase && reconcilablePhases.has(phase) && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full text-xs font-semibold"
              onClick={handleReconcile}
              isLoading={reconciling}
              disabled={reconciling || loading}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              {phaseLabels[phase].action}
            </Button>
          )}

          {phase && (phase === 'submitted' || phase === 'confirming' || phase === 'unknown' || phase === 'restoring') && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs font-semibold"
              disabled
              isLoading
            >
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              {phaseLabels[phase].action}...
            </Button>
          )}

          {phase === 'confirmed' && stellarTx && (
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${stellarTx}`}
              target="_blank"
              rel="noreferrer"
              className="w-full inline-flex items-center justify-center px-3 py-1.5 text-xs font-semibold rounded bg-emerald-700 text-white hover:bg-emerald-800"
            >
              <Globe className="w-3.5 h-3.5 mr-1" />
              Ver en Stellar Explorer
            </a>
          )}

          {phase === 'failed_terminal' && (
            <p className="text-[10px] text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
              La operación falló de forma terminal. Copiá el correlation ID y contactá a soporte.
            </p>
          )}

          {phase && (
            <p className="text-[10px] text-stone-500">
              {phaseLabels[phase].copy}
            </p>
          )}
        </div>

        {error && (
          <div className="p-2 bg-rose-50 text-rose-700 text-[10px] rounded border border-rose-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
