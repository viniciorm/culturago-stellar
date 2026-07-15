'use client';

import React, { useState } from 'react';
import { 
  Database, 
  Key, 
  Cpu, 
  Link as LinkIcon, 
  CheckCircle, 
  AlertCircle,
  FileCode,
  Globe,
  Loader2
} from 'lucide-react';
import { 
  Entity, 
  Credential, 
  db, 
  StellarStatus, 
  WalletStatus 
} from '../lib/db';
import { 
  registerEntityOnChain, 
  issueCredentialOnChain, 
  createPasskeyWallet, 
  linkWalletToEntity 
} from '../lib/stellar';
import { generateMetadataHash } from '../lib/hashes';
import { Button } from './ui/Button';

interface StellarStatusBlockProps {
  entity?: Entity | null;
  credential?: Credential | null;
  onUpdate: () => void;
}

export const StellarStatusBlock: React.FC<StellarStatusBlockProps> = ({
  entity,
  credential,
  onUpdate,
}) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const target = entity || credential;
  if (!target) return null;

  const isEntity = !!entity;
  const stellarStatus = target.stellar_status;
  const walletStatus = isEntity ? (entity?.wallet_status || 'none') : null;
  const walletAddress = isEntity ? (entity?.wallet_address || null) : null;
  const metadataHash = target.metadata_hash;
  const stellarTx = target.stellar_tx;

  // Handles chain registration simulation
  const handleRegisterOnChain = async () => {
    setLoadingAction('register');
    try {
      // 1. Generate Metadata Hash
      const hashData = isEntity 
        ? { id: entity.id, name: entity.display_name, type: entity.type, city: entity.city }
        : { id: credential!.id, code: credential!.credential_code, title: credential!.title };
      const computedHash = await generateMetadataHash(hashData);

      // Save intermediate status to db
      if (isEntity) {
        await db.updateEntity(entity.id, { stellar_status: 'pending', metadata_hash: computedHash });
      } else {
        await db.updateCredential(credential!.id, { stellar_status: 'pending', metadata_hash: computedHash });
      }
      onUpdate();

      // 2. Call Stellar Mock
      const chainResult = isEntity
        ? await registerEntityOnChain({ ...entity, metadata_hash: computedHash })
        : await issueCredentialOnChain({ ...credential!, metadata_hash: computedHash });

      // 3. Save final success status
      if (isEntity) {
        await db.updateEntity(entity.id, { 
          stellar_status: chainResult.status === 'success' ? 'registered' : 'failed',
          stellar_tx: chainResult.txHash
        });
      } else {
        await db.updateCredential(credential!.id, { 
          stellar_status: chainResult.status === 'success' ? 'registered' : 'failed',
          stellar_tx: chainResult.txHash
        });
      }
    } catch (e) {
      console.error(e);
      if (isEntity) {
        await db.updateEntity(entity.id, { stellar_status: 'failed' });
      } else {
        await db.updateCredential(credential!.id, { stellar_status: 'failed' });
      }
    } finally {
      setLoadingAction(null);
      onUpdate();
    }
  };

  // Handles passkey wallet creation simulation
  const handleCreatePasskey = async () => {
    if (!entity) return;
    setLoadingAction('passkey');
    try {
      const walletResult = await createPasskeyWallet(entity.id);
      await db.updateEntity(entity.id, {
        wallet_address: walletResult.walletAddress,
        wallet_status: 'reserved'
      });
      // Save in wallets table
      await db.createOrUpdateWallet(entity.id, {
        wallet_address: walletResult.walletAddress,
        wallet_type: 'passkey',
        wallet_status: 'reserved'
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAction(null);
      onUpdate();
    }
  };

  // Handles classic wallet linking simulation
  const handleLinkClassicWallet = async () => {
    if (!entity) return;
    setLoadingAction('link');
    try {
      const mockClassicKey = 'G' + Math.random().toString(36).substring(2, 10).toUpperCase() + 'CLASSICKEY' + Date.now().toString().substring(8);
      const linkResult = await linkWalletToEntity(entity.id, mockClassicKey);
      await db.updateEntity(entity.id, {
        wallet_address: linkResult.walletAddress,
        wallet_status: 'claimed'
      });
      await db.createOrUpdateWallet(entity.id, {
        wallet_address: linkResult.walletAddress,
        wallet_type: 'stellar_classic',
        wallet_status: 'claimed',
        claimed_at: new Date().toISOString()
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAction(null);
      onUpdate();
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
                Registrado
              </span>
            ) : stellarStatus === 'pending' ? (
              <span className="inline-flex items-center text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded">
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                Procesando
              </span>
            ) : stellarStatus === 'failed' ? (
              <span className="inline-flex items-center text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded">
                <AlertCircle className="w-3.5 h-3.5 mr-1" />
                Fallido
              </span>
            ) : (
              <span className="text-stone-500 bg-stone-100 px-2 py-0.5 rounded font-medium">
                No registrado
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
            <span className="text-stone-400 italic">No generado (requiere registrar en Stellar)</span>
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
                className="text-[#5C061E] hover:underline flex items-center gap-0.5 flex-shrink-0"
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

        {/* Actions Mocks */}
        <div className="pt-3 flex flex-col gap-2">
          {stellarStatus !== 'registered' && (
            <Button
              variant="primary"
              size="sm"
              className="w-full text-xs font-semibold"
              onClick={handleRegisterOnChain}
              isLoading={loadingAction === 'register'}
            >
              <Cpu className="w-3.5 h-3.5 mr-1" />
              Anclar y Registrar en Stellar
            </Button>
          )}

          {isEntity && walletStatus === 'none' && (
            <div className="grid grid-cols-2 gap-2 mt-1">
              <Button
                variant="secondary"
                size="sm"
                className="text-[10px] px-2"
                onClick={handleCreatePasskey}
                isLoading={loadingAction === 'passkey'}
              >
                <Key className="w-3 h-3 mr-1" />
                Reservar Passkey
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="text-[10px] px-2"
                onClick={handleLinkClassicWallet}
                isLoading={loadingAction === 'link'}
              >
                <LinkIcon className="w-3 h-3 mr-1" />
                Vincular Wallet
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
