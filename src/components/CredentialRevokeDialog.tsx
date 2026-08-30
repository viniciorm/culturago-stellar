'use client';

import React, { useState } from 'react';
import type { Credential } from '@/domain/types/entities';
import type { PrepareCredentialResult } from '@/app/dashboard/credenciales/actions';
import { prepareCredentialRevoke, updateCredential } from '@/app/dashboard/credenciales/actions';
import { reconcileOperation } from '@/app/dashboard/entities/actions';
import { signAndSubmitOperation } from '@/lib/smartWallet/signAndSubmitOperation';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { StellarStatusBlock } from './StellarStatusBlock';

interface CredentialRevokeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  credential: Credential | null;
  onUpdate?: () => void;
}

export function CredentialRevokeDialog({
  isOpen,
  onClose,
  credential,
  onUpdate,
}: CredentialRevokeDialogProps) {
  const [reason, setReason] = useState('');
  const [prepared, setPrepared] = useState<PrepareCredentialResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);

  if (!isOpen || !credential) return null;

  const handlePrepare = async () => {
    if (isPreparing) return;
    setIsPreparing(true);
    setSubmitError(null);
    try {
      const result = await prepareCredentialRevoke(credential.id, reason);
      setPrepared(result);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Error preparando revocación');
    } finally {
      setIsPreparing(false);
    }
  };

  const handleSubmit = async () => {
    if (!prepared) return;
    setSubmitError(null);
    try {
      const result = await signAndSubmitOperation(
        prepared.environment,
        prepared.walletAddress,
        prepared.operation,
        prepared.prepared
      );
      if (result.ok) {
        await updateCredential(credential.id, {
          status: 'revoked',
          revoked_at: new Date().toISOString(),
        });
        onUpdate?.();
        onClose();
      } else {
        setSubmitError(result.message);
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Error enviando revocación');
    }
  };

  const handleReconcile = async () => {
    if (!prepared) return;
    setSubmitError(null);
    try {
      const state = await reconcileOperation(prepared.operation.operationId);
      setPrepared({ ...prepared, operation: state });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Error reconciliando');
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Revocar credencial en Stellar" size="md">
      <div className="space-y-4">
        {!prepared ? (
          <div className="space-y-3">
            <p className="text-xs text-stone-600">
              La revocación se registrará on-chain y no puede deshacerse. Agregá un motivo para
              el registro público.
            </p>
            <div>
              <label htmlFor="revoke-reason" className="text-xs font-semibold text-stone-700 block mb-1">
                Motivo de revocación
              </label>
              <textarea
                id="revoke-reason"
                className="w-full border border-stone-300 rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#C5A880]"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej: credencial duplicada, error de emisión, retiro voluntario..."
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              className="w-full text-xs font-semibold"
              onClick={handlePrepare}
              disabled={!reason.trim() || isPreparing}
              isLoading={isPreparing}
            >
              Preparar revocación Stellar
            </Button>
            {submitError && (
              <p className="text-[10px] text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                {submitError}
              </p>
            )}
          </div>
        ) : (
          <StellarStatusBlock
            credential={credential}
            operation={prepared.operation}
            onUpdate={() => {
              // nothing here; submit path handles the on-chain success
            }}
            onPrepare={handlePrepare}
            onSubmit={handleSubmit}
            onReconcile={handleReconcile}
          />
        )}
      </div>
    </Dialog>
  );
}
