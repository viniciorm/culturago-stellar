'use client';

import React, { useState } from 'react';
import {
  Cpu,
  CheckCircle,
  AlertCircle,
  FileCode,
  Globe,
  Loader2
} from 'lucide-react';
import type { Entity, Credential } from '@/domain/types/entities';
import { Button } from './ui/Button';

interface StellarStatusBlockProps {
  entity?: Entity | null;
  credential?: Credential | null;
  onUpdate?: () => void;
  onPrepare?: () => Promise<void>;
  onSubmit?: () => Promise<void>;
}

export const StellarStatusBlock: React.FC<StellarStatusBlockProps> = ({
  entity,
  credential,
  onUpdate,
  onPrepare,
  onSubmit,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = entity || credential;
  if (!target) return null;

  const isEntity = !!entity;
  const stellarStatus = target.stellar_status;
  const walletStatus = isEntity ? (entity?.wallet_status || 'none') : null;
  const walletAddress = isEntity ? (entity?.wallet_address || null) : null;
  const metadataHash = target.metadata_hash;
  const stellarTx = target.stellar_tx;

  const statusLabels: Record<string, string> = {
    not_registered: 'No registrado',
    pending: 'Pendiente de firma',
    registered: 'Registrado',
    failed: 'Fallido',
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
        <div className="flex items-center justify-between border-b border-stone-100 pb-2">
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

        {/* Prepare on-chain action */}
        {onPrepare && stellarStatus === 'not_registered' && (
          <div className="pt-3">
            <Button
              variant="primary"
              size="sm"
              className="w-full text-xs font-semibold"
              onClick={handlePrepare}
              isLoading={loading}
            >
              <Cpu className="w-3.5 h-3.5 mr-1" />
              Preparar operación Stellar
            </Button>
            <p className="text-[10px] text-stone-500 mt-1.5">
              Crea una operación en estado <em>awaiting_signature</em>. Luego debe ser firmada por el operador.
            </p>
          </div>
        )}

        {onSubmit && stellarStatus === 'pending' && (
          <div className="pt-3">
            <Button
              variant="primary"
              size="sm"
              className="w-full text-xs font-semibold"
              onClick={handleSubmit}
              isLoading={loading}
            >
              <Cpu className="w-3.5 h-3.5 mr-1" />
              Firmar y enviar
            </Button>
            <p className="text-[10px] text-stone-500 mt-1.5">
              Firma la operación con el passkey y la envía a la red para confirmación.
            </p>
          </div>
        )}

        {error && (
          <div className="p-2 bg-rose-50 text-rose-700 text-[10px] rounded border border-rose-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
