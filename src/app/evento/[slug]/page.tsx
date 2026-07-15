'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Calendar, MapPin, Building, ShieldCheck, Trophy, Truck, ArrowLeft, Globe, Users } from 'lucide-react';
import { PublicLayout } from '../../../components/PublicLayout';
import { db, Event, Entity, Organization, Provider, Relationship } from '../../../lib/db';
import { Button } from '../../../components/ui/Button';
import { EntityCard } from '../../../components/EntityCard';

export default function EventPublicPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [event, setEvent] = useState<(Event & { entity: Entity }) | null>(null);
  const [organizer, setOrganizer] = useState<Organization | null>(null);
  const [participants, setParticipants] = useState<{ entity: Entity; org?: Organization | null; person?: any }[]>([]);
  const [providers, setProviders] = useState<{ entity: Entity; provider: Provider }[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadEventData() {
      try {
        const ev = await db.getEventBySlug(slug);
        if (!ev) {
          setIsLoading(false);
          return;
        }
        setEvent(ev);

        // Load organizer details
        if (ev.organizer_entity_id) {
          const orgData = await db.getOrganizationByEntityId(ev.organizer_entity_id);
          setOrganizer(orgData);
        }

        // Load relationships context to this event
        const rels = await db.getRelationships();
        const eventRels = rels.filter(r => r.context_event_id === ev.id && r.status === 'active');

        // Extract schools/artists (participants)
        const participantList: typeof participants = [];
        const providerList: typeof providers = [];

        for (const rel of eventRels) {
          const fromEntity = rel.fromEntity;
          if (!fromEntity) continue;

          if (rel.relationship_type === 'participant_of') {
            if (fromEntity.type === 'organization') {
              const org = await db.getOrganizationByEntityId(fromEntity.id);
              participantList.push({ entity: fromEntity, org });
            } else if (fromEntity.type === 'person') {
              const person = await db.getPersonByEntityId(fromEntity.id);
              participantList.push({ entity: fromEntity, person });
            }
          } else if (
            rel.relationship_type === 'official_photographer_of' ||
            rel.relationship_type === 'official_videographer_of' ||
            rel.relationship_type === 'provider_of' ||
            rel.relationship_type === 'venue_of' ||
            rel.relationship_type === 'sponsor_of'
          ) {
            if (fromEntity.type === 'provider') {
              const provider = await db.getProviderByEntityId(fromEntity.id);
              if (provider) {
                providerList.push({ entity: fromEntity, provider });
              }
            }
          }
        }

        setParticipants(participantList);
        setProviders(providerList);

      } catch (e) {
        console.error('Error loading event public data:', e);
      } finally {
        setIsLoading(false);
      }
    }

    if (slug) {
      loadEventData();
    }
  }, [slug]);

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center py-20 text-stone-400">
          Cargando detalles del festival...
        </div>
      </PublicLayout>
    );
  }

  if (!event) {
    return (
      <PublicLayout>
        <div className="max-w-md mx-auto text-center py-20 space-y-4">
          <h2 className="text-xl font-bold text-[#1C1A17] font-serif">Evento no encontrado</h2>
          <p className="text-stone-500 text-sm">
            El evento con identificador <span className="font-mono">{slug}</span> no se encuentra registrado en CulturaGO.
          </p>
          <Button variant="secondary" onClick={() => router.push('/')}>
            Volver al Portal
          </Button>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      {/* Back to Home */}
      <button 
        onClick={() => router.push('/')}
        className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-[#5C061E] mb-6 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Volver al Inicio
      </button>

      {/* Hero Header */}
      <div className="bg-[#FCFBF7] border-2 border-stone-200/60 rounded-2xl p-6 md:p-8 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden mb-12">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-36 h-36 rounded-full border border-[#C5A880]/15 pointer-events-none" />
        
        <div className="space-y-4 text-left max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#5C061E]/5 border border-[#5C061E]/10 text-xs font-semibold text-[#5C061E]">
            <Trophy className="w-3.5 h-3.5 text-[#C5A880]" />
            Acreditación Cultural Verificable
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-[#1C1A17] leading-tight">
            {event.name}
          </h1>
          <p className="text-sm text-stone-500 leading-relaxed">
            {event.description}
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 text-xs text-stone-600">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#C5A880]" />
              <span>
                {new Date(event.start_date).toLocaleDateString('es-CL')} al{' '}
                {event.end_date ? new Date(event.end_date).toLocaleDateString('es-CL') : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#C5A880]" />
              <span>{event.location} — {event.address}</span>
            </div>
          </div>
        </div>

        <div className="w-full md:w-auto flex-shrink-0 flex flex-col items-stretch gap-3 bg-stone-50 border border-stone-200 rounded-xl p-4">
          <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
            Organizador Oficial
          </span>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#5C061E] flex items-center justify-center text-[#C5A880] font-bold text-sm">
              FD
            </div>
            <div className="text-left">
              <span className="text-xs font-bold text-stone-800 block">
                {organizer?.name || 'Organización FDVC'}
              </span>
              <span className="text-[9px] font-semibold text-[#C5A880] block">
                {organizer?.instagram || '@fdvc_chile'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Participants & Providers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 text-left">
        {/* Left 2 Cols: Participating Schools and Artists */}
        <div className="lg:col-span-2 space-y-8">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <h2 className="font-serif text-2xl font-bold text-[#1C1A17] flex items-center gap-2">
              <Users className="w-6 h-6 text-[#C5A880]" />
              Escuelas y Bailarinas Participantes
            </h2>
            <span className="text-xs text-stone-400 font-semibold bg-stone-100 px-2 py-0.5 rounded">
              Verificadas: {participants.length}
            </span>
          </div>

          {participants.length === 0 ? (
            <div className="text-center py-12 bg-[#FCFBF7] border border-dashed border-stone-200 rounded-xl text-stone-400 text-sm">
              Aún no se han acreditado participantes para este evento.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {participants.map(({ entity, org, person }) => (
                <EntityCard
                  key={entity.id}
                  entity={entity}
                  org={org}
                  person={person}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right 1 Col: Official Providers & Logistics */}
        <div className="space-y-8">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <h2 className="font-serif text-2xl font-bold text-[#1C1A17] flex items-center gap-2">
              <Truck className="w-6 h-6 text-[#C5A880]" />
              Proveedores Oficiales
            </h2>
            <span className="text-xs text-stone-400 font-semibold bg-stone-100 px-2 py-0.5 rounded">
              Acreditados: {providers.length}
            </span>
          </div>

          {providers.length === 0 ? (
            <div className="text-center py-12 bg-[#FCFBF7] border border-dashed border-stone-200 rounded-xl text-stone-400 text-sm">
              Aún no hay proveedores acreditados para este evento.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {providers.map(({ entity, provider }) => (
                <EntityCard
                  key={entity.id}
                  entity={entity}
                  provider={provider}
                />
              ))}
            </div>
          )}

          {/* Verification Box info */}
          <div className="p-5 bg-[#5C061E]/5 rounded-xl border border-[#5C061E]/10 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#5C061E]" />
              <h4 className="text-xs font-bold text-[#5C061E] uppercase tracking-wider">
                Verificado por CulturaGO
              </h4>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Todos los participantes y proveedores listados aquí cuentan con un Pasaporte Cultural Digital emitido por FDVC 2026. Sus datos están firmados y vinculados de manera única mediante hashes seguros en la red Stellar.
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
