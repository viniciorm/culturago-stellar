import React from 'react';
import { User, ShieldCheck, MapPin, Globe, Calendar, Award } from 'lucide-react';
import { Entity, Person } from '../lib/db';
import { VerificationBadge, StellarStatusBadge } from './ui/Badge';

interface PassportCardProps {
  entity: Entity;
  person: Person;
  schoolName?: string | null;
}

export const PassportCard: React.FC<PassportCardProps> = ({
  entity,
  person,
  schoolName,
}) => {
  const getRoleLabel = (role: string) => {
    const roles: Record<string, string> = {
      dancer: 'Bailarina / Intérprete',
      teacher: 'Profesora / Directora',
      judge: 'Jurado Nacional',
      guest: 'Artista Invitada',
      staff: 'Equipo de Producción',
      other: 'Colaboradora',
    };
    return roles[role] || 'Bailarina';
  };

  return (
    <div className="relative overflow-hidden w-full max-w-md mx-auto bg-[#FCFBF7] border-2 border-[#C5A880]/60 rounded-2xl shadow-xl p-6 select-none">
      {/* Background delicate filigree effect */}
      <div className="absolute top-0 right-0 -mt-16 -mr-16 w-48 h-48 rounded-full border border-[#C5A880]/20 pointer-events-none" />
      <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-56 h-56 rounded-full border border-[#C5A880]/15 pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#C5A880]/30 pb-4 mb-5">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#C5A880]">
            REPÚBLICA DE CHILE
          </span>
          <span className="font-serif text-xs font-semibold text-[#5C061E]">
            PASAPORTE CULTURAL DIGITAL
          </span>
        </div>
        <div className="w-8 h-8 rounded-full border border-[#C5A880]/40 flex items-center justify-center text-[#5C061E] bg-[#C5A880]/10 font-bold text-xs">
          FDVC
        </div>
      </div>

      {/* Main Body */}
      <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
        {/* Photo Container */}
        <div className="flex-shrink-0 relative w-32 h-36 rounded-xl border border-stone-200 bg-[#FCFBF7] shadow-inner flex flex-col items-center justify-center overflow-hidden">
          {person.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={person.photo_url}
              alt={person.artistic_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center text-stone-300">
              <User className="w-12 h-12" />
              <span className="text-[8px] uppercase font-bold tracking-wider text-stone-400 mt-2">
                Sin Fotografía
              </span>
            </div>
          )}
          
          {/* Micro overlay to feel official */}
          <div className="absolute bottom-1 right-1 px-1 bg-[#FCFBF7]/85 border border-[#C5A880]/50 rounded text-[7px] font-bold text-[#5C061E] uppercase tracking-wider">
            FDVC 2026
          </div>
        </div>

        {/* Passport Fields */}
        <div className="flex-1 w-full space-y-3.5 text-left">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block">
              Nombre Artístico
            </span>
            <span className="text-base font-serif font-bold text-[#1C1A17] block leading-tight">
              {person.artistic_name}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block">
                Rol Principal
              </span>
              <span className="text-xs font-semibold text-stone-700 block">
                {getRoleLabel(person.main_role)}
              </span>
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block">
                Escuela / Círculo
              </span>
              <span className="text-xs font-semibold text-stone-700 block truncate">
                {schoolName || 'Independiente'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block">
                Ciudad de Origen
              </span>
              <span className="text-xs font-semibold text-stone-600 block">
                {entity.city || 'Santiago'}
              </span>
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block">
                Nacionalidad
              </span>
              <span className="text-xs font-semibold text-stone-600 block">
                {entity.country || 'Chile'}
              </span>
            </div>
          </div>

          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block">
              Código Único de Registro
            </span>
            <span className="text-[10px] font-mono text-stone-500 font-semibold uppercase block">
              {entity.id.substring(0, 18).toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Footer details & stamp */}
      <div className="border-t border-[#C5A880]/30 pt-4 mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold text-stone-400 uppercase">Verificación:</span>
            <VerificationBadge />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold text-stone-400 uppercase">Stellar:</span>
            <StellarStatusBadge status={entity.stellar_status} />
          </div>
        </div>

        {/* Official stamp */}
        <div className="flex items-center gap-2 border border-dashed border-[#C5A880] rounded-lg px-2.5 py-1.5 self-end sm:self-auto bg-[#FCFBF7]">
          <Award className="w-4 h-4 text-[#C5A880]" />
          <div className="flex flex-col">
            <span className="text-[7px] font-bold text-[#5C061E] uppercase tracking-wider">
              Acreditación FDVC
            </span>
            <span className="text-[6px] font-bold text-stone-400 uppercase">
              Validez: Sep 2026
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
