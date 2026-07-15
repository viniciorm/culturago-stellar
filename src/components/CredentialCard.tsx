import React from 'react';
import { Award, ShieldCheck, Calendar, Hash, FileCode } from 'lucide-react';
import { Credential, Entity } from '../lib/db';
import { StatusBadge, StellarStatusBadge } from './ui/Badge';

interface CredentialCardProps {
  credential: Credential;
  issuerEntity: Entity;
  subjectEntity: Entity;
  eventYear?: number;
}

export const CredentialCard: React.FC<CredentialCardProps> = ({
  credential,
  issuerEntity,
  subjectEntity,
  eventYear = 2026,
}) => {
  const getCredentialIcon = () => {
    return <Award className="w-8 h-8 text-[#C5A880]" />;
  };

  const getFormattedDate = (dateString?: string | null) => {
    if (!dateString) return 'Pendiente de emisión';
    return new Date(dateString).toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <div className="relative overflow-hidden w-full max-w-lg mx-auto bg-[#FCFBF7] border-2 border-stone-200/80 rounded-2xl shadow-lg p-6 hover:border-[#C5A880]/50 transition-all duration-300">
      {/* Top background accent stripe */}
      <div className="absolute top-0 inset-x-0 h-2 bg-[#5C061E]" />

      {/* Decorative Gold Seal Background */}
      <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-[#C5A880]/5 rounded-full border-4 border-dashed border-[#C5A880]/10 flex items-center justify-center pointer-events-none">
        <Award className="w-16 h-16 text-[#C5A880]/10" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-stone-200/60 pb-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#5C061E]/5 rounded-xl border border-[#5C061E]/10">
            {getCredentialIcon()}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-stone-400 uppercase tracking-widest leading-none">
              Acreditación Oficial
            </h4>
            <h3 className="text-lg font-serif font-bold text-[#1C1A17] mt-1 leading-tight">
              {credential.title}
            </h3>
          </div>
        </div>
        <StatusBadge status={credential.status} />
      </div>

      {/* Main Info */}
      <div className="space-y-4 text-left">
        <div>
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
            Otorgada A
          </span>
          <span className="text-base font-semibold text-[#1C1A17] block">
            {subjectEntity.display_name}
          </span>
          <span className="text-xs text-stone-500 capitalize">
            Identidad cultural {subjectEntity.type === 'person' ? 'personal' : subjectEntity.type === 'provider' ? 'de proveedor' : 'organizacional'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Emitida Por
            </span>
            <span className="text-xs font-semibold text-stone-700 block">
              {issuerEntity.display_name}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Fecha de Emisión
            </span>
            <span className="text-xs font-semibold text-stone-700 block">
              {getFormattedDate(credential.issued_at)}
            </span>
          </div>
        </div>

        <div className="pt-3 border-t border-stone-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-stone-500">
          <div className="flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-stone-400" />
            <span>Código: <span className="font-mono font-semibold">{credential.credential_code}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-stone-400" />
            <span>Evento: <span className="font-semibold">FDVC {eventYear}</span></span>
          </div>
        </div>
      </div>

      {/* Description text */}
      {credential.description && (
        <div className="mt-4 p-3 bg-stone-50 rounded-lg border border-stone-200/50 text-xs text-stone-500 leading-relaxed text-left">
          {credential.description}
        </div>
      )}

      {/* Verification footer block */}
      <div className="mt-5 pt-4 border-t border-stone-200/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-800">
              Acreditación verificada por FDVC
            </span>
          </div>
          <div className="mt-1">
            <StellarStatusBadge status={credential.stellar_status} />
          </div>
        </div>

        {credential.metadata_hash && (
          <div className="flex items-center gap-1 text-[10px] text-stone-400 font-mono select-all self-end sm:self-auto bg-stone-100 px-2 py-1 rounded">
            <FileCode className="w-3 h-3 flex-shrink-0" />
            <span>Hash: {credential.metadata_hash.substring(0, 12)}...</span>
          </div>
        )}
      </div>
    </div>
  );
};
