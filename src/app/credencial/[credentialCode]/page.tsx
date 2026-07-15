'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Award, ShieldCheck, CheckCircle2, XCircle, Clock, Database, Globe, Calendar, FileCode } from 'lucide-react';
import { PublicLayout } from '../../../components/PublicLayout';
import { db, PopulatedCredential, Entity } from '../../../lib/db';
import { QRCodeBlock } from '../../../components/ui/QRCodeBlock';
import { CredentialCard } from '../../../components/CredentialCard';
import { Button } from '../../../components/ui/Button';

export default function CredentialValidationPage() {
  const params = useParams();
  const router = useRouter();
  const credentialCode = params.credentialCode as string;

  const [credential, setCredential] = useState<PopulatedCredential | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadCredentialData() {
      try {
        const data = await db.getCredentialByCode(credentialCode);
        setCredential(data);
      } catch (e) {
        console.error('Error loading public credential data:', e);
      } finally {
        setIsLoading(false);
      }
    }

    if (credentialCode) {
      loadCredentialData();
    }
  }, [credentialCode]);

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center py-20 text-stone-400">
          Verificando credencial en la base de datos...
        </div>
      </PublicLayout>
    );
  }

  if (!credential) {
    return (
      <PublicLayout>
        <div className="max-w-md mx-auto text-center py-20 space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto text-rose-600">
            <XCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-[#1C1A17] font-serif">Credencial No Encontrada</h2>
          <p className="text-stone-500 text-sm">
            El código de credencial <span className="font-mono font-semibold">{credentialCode}</span> no coincide con ningún registro emitido en CulturaGO.
          </p>
          <Button variant="secondary" onClick={() => router.push('/')}>
            Volver al Portal
          </Button>
        </div>
      </PublicLayout>
    );
  }

  const credentialUrl = typeof window !== 'undefined' 
    ? window.location.href 
    : `https://culturago.stellar.app/credencial/${credential.credential_code}`;

  return (
    <PublicLayout>
      {/* Back button */}
      <button 
        onClick={() => router.push('/evento/fdvc-2026')}
        className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-[#5C061E] mb-6 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Ver Festival FDVC 2026
      </button>

      {/* Verification Status Banner */}
      <div className={`max-w-3xl mx-auto rounded-2xl p-5 border mb-8 flex items-center gap-4 text-left
        ${credential.status === 'issued' 
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
          : credential.status === 'revoked' 
          ? 'bg-rose-50 text-rose-800 border-rose-200' 
          : 'bg-stone-50 text-stone-800 border-stone-200'}`}
      >
        <div className={`p-2.5 rounded-xl border
          ${credential.status === 'issued' 
            ? 'bg-emerald-100/50 border-emerald-300 text-emerald-700' 
            : credential.status === 'revoked' 
            ? 'bg-rose-100/50 border-rose-300 text-rose-700' 
            : 'bg-stone-200/50 border-stone-300 text-stone-600'}`}
        >
          {credential.status === 'issued' ? (
            <CheckCircle2 className="w-6 h-6" />
          ) : credential.status === 'revoked' ? (
            <XCircle className="w-6 h-6" />
          ) : (
            <Clock className="w-6 h-6" />
          )}
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold uppercase tracking-wider">
            {credential.status === 'issued' ? 'Credencial Válida' 
             : credential.status === 'revoked' ? 'Credencial Revocada' 
             : 'Acreditación Pendiente'}
          </h3>
          <p className="text-xs opacity-90 mt-1">
            {credential.status === 'issued' ? 'Esta acreditación cultural se encuentra vigente y debidamente autenticada.' 
             : credential.status === 'revoked' ? 'Esta credencial ha sido invalidada y revocada por la organización emisora.' 
             : 'Esta acreditación se encuentra registrada en borrador y aún no está emitida.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start text-left max-w-5xl mx-auto">
        {/* Left Column: Visual Credential Card */}
        <div className="md:col-span-2 space-y-6">
          <h2 className="font-serif text-xl font-bold text-[#1C1A17] border-b border-stone-200 pb-2">
            Vista de Acreditación Digital
          </h2>
          
          <CredentialCard
            credential={credential}
            issuerEntity={credential.issuerEntity}
            subjectEntity={credential.subjectEntity}
            eventYear={credential.event?.year || 2026}
          />

          {/* Technical verification box */}
          <div className="bg-[#FCFBF7] border border-stone-200/80 rounded-xl p-5 shadow-xs space-y-4">
            <h4 className="text-xs font-bold text-stone-700 flex items-center gap-1.5 uppercase tracking-wider">
              <Database className="w-4 h-4 text-[#C5A880]" />
              Verificación Matemática y Registro Stellar
            </h4>
            
            <div className="space-y-3.5 text-xs">
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-stone-500">Hash de Metadata de Acreditación:</span>
                {credential.metadata_hash ? (
                  <div className="font-mono text-[10px] bg-stone-150 p-2 rounded break-all select-all border border-stone-200 text-stone-600">
                    {credential.metadata_hash}
                  </div>
                ) : (
                  <span className="text-stone-400 italic">No generado (borrador)</span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <span className="font-semibold text-stone-500">Identificador Transaccional (Stellar Tx):</span>
                {credential.stellar_tx ? (
                  <div className="flex items-center justify-between gap-1.5 font-mono text-[10px] bg-stone-150 p-2 rounded break-all select-all border border-stone-200 text-stone-600">
                    <span className="truncate">{credential.stellar_tx}</span>
                    <a 
                      href={`https://stellar.expert/explorer/testnet/tx/${credential.stellar_tx}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#5C061E] hover:underline flex items-center gap-0.5 flex-shrink-0"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      Explorador
                    </a>
                  </div>
                ) : (
                  <span className="text-stone-400 italic">
                    {credential.stellar_status === 'pending' ? 'Procesando transacción Stellar...' : 'Registro Stellar no ejecutado aún.'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-stone-200/50 pt-3 text-stone-500">
                <div>
                  <span className="font-semibold block">Código de Credencial:</span>
                  <span className="font-mono font-bold text-[#1C1A17]">{credential.credential_code}</span>
                </div>
                <div>
                  <span className="font-semibold block">Red de Verificación:</span>
                  <span className="font-bold text-stone-700">Stellar Testnet / Soroban</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: QR validation */}
        <div className="space-y-6">
          <h2 className="font-serif text-xl font-bold text-[#1C1A17] border-b border-stone-200 pb-2">
            Código QR de Autenticación
          </h2>
          
          <QRCodeBlock
            value={credentialUrl}
            label="Cualquier inspector cultural puede escanear este QR en el acceso para verificar la vigencia de la credencial en tiempo real."
          />
        </div>
      </div>
    </PublicLayout>
  );
}
