import React from 'react';
import Link from 'next/link';
import { User, Building2, Truck, Calendar, MapPin, ChevronRight } from 'lucide-react';
import { Entity, Person, Organization, Provider, Event } from '../lib/db';
import { StatusBadge, StellarStatusBadge } from './ui/Badge';

interface EntityCardProps {
  entity: Entity;
  person?: Person | null;
  org?: Organization | null;
  provider?: Provider | null;
  event?: Event | null;
  href?: string;
}

export const EntityCard: React.FC<EntityCardProps> = ({
  entity,
  person,
  org,
  provider,
  event,
  href,
}) => {
  const getEntityDetails = () => {
    switch (entity.type) {
      case 'person':
        return {
          icon: <User className="w-5 h-5 text-[#C5A880]" />,
          typeName: 'Artista / Persona',
          sub: person?.main_role === 'dancer' ? 'Bailarina' 
             : person?.main_role === 'teacher' ? 'Profesora / Directora'
             : person?.main_role === 'judge' ? 'Jurado'
             : person?.main_role === 'guest' ? 'Invitada'
             : person?.main_role === 'staff' ? 'Staff'
             : 'Persona',
          description: person?.bio || 'Sin descripción artística.',
        };
      case 'organization':
        return {
          icon: <Building2 className="w-5 h-5 text-[#C5A880]" />,
          typeName: 'Organización',
          sub: org?.organization_type === 'school' ? 'Escuela de Danza'
             : org?.organization_type === 'academy' ? 'Academia'
             : org?.organization_type === 'company' ? 'Compañía'
             : org?.organization_type === 'festival' ? 'Festival'
             : 'Organización',
          description: `Contacto: ${org?.contact_name || 'No especificado'}`,
        };
      case 'provider':
        return {
          icon: <Truck className="w-5 h-5 text-[#C5A880]" />,
          typeName: 'Proveedor Cultural',
          sub: provider?.provider_type === 'photographer' ? 'Fotografía Oficial'
             : provider?.provider_type === 'videographer' ? 'Video Oficial'
             : provider?.provider_type === 'venue' ? 'Sede / Teatro'
             : provider?.provider_type === 'sponsor' ? 'Auspiciador'
             : 'Proveedor',
          description: provider?.public_description || 'Proveedor de servicios culturales.',
        };
      case 'event':
        return {
          icon: <Calendar className="w-5 h-5 text-[#C5A880]" />,
          typeName: 'Evento Cultural',
          sub: 'Festival',
          description: event?.description || 'Encuentro cultural.',
        };
    }
  };

  const details = getEntityDetails();
  
  // Resolve link target based on type
  const targetHref = href || (
    entity.type === 'person' ? `/p/${entity.slug}`
    : entity.type === 'organization' ? `/o/${entity.slug}`
    : entity.type === 'provider' ? `/proveedor/${entity.slug}`
    : `/evento/${entity.slug}`
  );

  return (
    <div className="bg-[#FCFBF7] rounded-xl border border-stone-200/60 p-5 hover:shadow-md hover:border-stone-300 transition-all duration-200 flex flex-col justify-between group">
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-stone-100 rounded-lg">
              {details.icon}
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400">
              {details.typeName}
            </span>
          </div>
          <StatusBadge status={entity.status} />
        </div>

        <h3 className="text-base font-bold text-[#1C1A17] group-hover:text-[#5C061E] transition-colors leading-tight mb-1">
          {entity.display_name}
        </h3>
        <p className="text-xs font-semibold text-[#C5A880] mb-2">{details.sub}</p>

        <p className="text-xs text-stone-500 line-clamp-2 mb-4 leading-relaxed">
          {details.description}
        </p>
      </div>

      <div className="pt-4 border-t border-stone-100 flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs text-stone-400">
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {entity.city}, {entity.country}
          </span>
          <StellarStatusBadge status={entity.stellar_status} />
        </div>

        <Link
          href={targetHref}
          className="inline-flex items-center justify-center gap-1 w-full mt-1 py-2 bg-stone-50 hover:bg-[#5C061E]/5 rounded-lg text-xs font-semibold text-stone-600 hover:text-[#5C061E] border border-stone-200/50 transition-colors"
        >
          Ver Perfil Público
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};
