'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Building2, ShieldCheck, Award, MapPin, Globe, Users } from 'lucide-react';
import { PublicLayout } from '../../../components/PublicLayout';
import { db, Entity, Organization, Credential, Relationship, Person } from '../../../lib/db';
import { QRCodeBlock } from '../../../components/ui/QRCodeBlock';
import { StatusBadge, StellarStatusBadge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';

export default function OrganizationPublicPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [org, setOrg] = useState<(Organization & { entity: Entity }) | null>(null);
  const [members, setMembers] = useState<{ entity: Entity; person: Person; relType: string }[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadOrgData() {
      try {
        const data = await db.getOrganizationByEntitySlug(slug);
        if (!data) {
          setIsLoading(false);
          return;
        }
        setOrg(data);

        // Find associated members (relationship where to_entity_id = org.entity_id)
        const rels = await db.getRelationships();
        const orgRels = rels.filter(r => r.to_entity_id === data.entity_id && r.status === 'active');
        
        const memberList: typeof members = [];
        for (const rel of orgRels) {
          const fromEntity = rel.fromEntity;
          if (fromEntity && fromEntity.type === 'person') {
            const person = await db.getPersonByEntityId(fromEntity.id);
            if (person) {
              memberList.push({ entity: fromEntity, person, relType: rel.relationship_type });
            }
          }
        }
        setMembers(memberList);

        // Find credentials
        const creds = await db.getCredentials();
        const orgCreds = creds.filter(c => c.subject_entity_id === data.entity_id && c.status === 'issued');
        setCredentials(orgCreds);

      } catch (e) {
        console.error('Error loading public organization data:', e);
      } finally {
        setIsLoading(false);
      }
    }

    if (slug) {
      loadOrgData();
    }
  }, [slug]);

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center py-20 text-stone-400">
          Cargando perfil organizacional...
        </div>
      </PublicLayout>
    );
  }

  if (!org) {
    return (
      <PublicLayout>
        <div className="max-w-md mx-auto text-center py-20 space-y-4">
          <h2 className="text-xl font-bold text-[#1C1A17] font-serif">Organización no encontrada</h2>
          <p className="text-stone-500 text-sm">
            La organización con el identificador <span className="font-mono">{slug}</span> no cuenta con un perfil registrado en CulturaGO.
          </p>
          <Button variant="secondary" onClick={() => router.push('/')}>
            Volver al Portal
          </Button>
        </div>
      </PublicLayout>
    );
  }

  const getOrgTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      school: 'Escuela de Danza Árabe',
      academy: 'Academia de Danza',
      company: 'Compañía Estable',
      association: 'Asociación Cultural',
      producer: 'Productora del Evento',
      festival: 'Festival Nacional',
      community: 'Comunidad Cultural',
    };
    return types[type] || 'Organización Cultural';
  };

  const getRelLabel = (type: string) => {
    const rels: Record<string, string> = {
      member_of: 'Bailarina / Miembro',
      teacher_at: 'Profesora / Coreógrafa',
      director_of: 'Directora Académica',
      founder_of: 'Fundadora',
    };
    return rels[type] || 'Integrante';
  };

  const orgUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/o/${org.entity.slug}`
    : `https://culturago.stellar.app/o/${org.entity.slug}`;

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

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start text-left">
        {/* Left Columns: Org Info, Members List */}
        <div className="md:col-span-2 space-y-8">
          {/* Org Header Card */}
          <div className="bg-[#FCFBF7] border-2 border-stone-200/60 rounded-2xl p-6 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-36 h-36 rounded-full border border-[#C5A880]/15 pointer-events-none" />
            
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-[#5C061E]/5 rounded-xl border border-[#5C061E]/10">
                <Building2 className="w-6 h-6 text-[#C5A880]" />
              </div>
              <StatusBadge status={org.entity.status} />
            </div>

            <h1 className="font-serif text-3xl font-bold text-[#1C1A17]">{org.name}</h1>
            <p className="text-xs font-bold text-[#C5A880] mt-1.5 uppercase tracking-wider">
              {getOrgTypeLabel(org.organization_type)}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 mt-5 border-t border-stone-200/50 text-xs text-stone-600">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-stone-400" />
                <span>{org.entity.city}, {org.entity.country}</span>
              </div>
              {org.instagram && (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
                  <a href={`https://instagram.com/${org.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" className="hover:underline">
                    {org.instagram}
                  </a>
                </div>
              )}
              {org.website && (
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-stone-400" />
                  <a href={org.website} target="_blank" rel="noreferrer" className="hover:underline text-[#5C061E] font-semibold">
                    Visitar Sitio Web
                  </a>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
              <span className="text-[10px] text-stone-400 uppercase font-bold">Verificación Blockchain:</span>
              <StellarStatusBadge status={org.entity.stellar_status} />
            </div>
          </div>

          {/* Members List */}
          <div className="space-y-4">
            <h3 className="font-serif text-xl font-bold text-[#1C1A17] border-b border-stone-200 pb-2 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#C5A880]" />
              Staff y Bailarinas Asociadas
            </h3>

            {members.length === 0 ? (
              <div className="text-sm text-stone-400 italic py-6 bg-stone-50 border border-stone-200/50 rounded-xl text-center">
                No hay integrantes registrados en esta escuela/organización.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {members.map(({ entity, person, relType }) => (
                  <div 
                    key={entity.id}
                    onClick={() => router.push(`/p/${entity.slug}`)}
                    className="p-4 bg-white border border-stone-200/60 rounded-xl shadow-xs hover:border-[#C5A880]/60 transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="text-left">
                      <span className="text-[8px] uppercase font-bold text-[#C5A880] tracking-wider block">
                        {getRelLabel(relType)}
                      </span>
                      <h4 className="text-sm font-bold text-stone-850 group-hover:text-[#5C061E] transition-colors leading-tight mt-1">
                        {person.artistic_name}
                      </h4>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
                      <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: QR and Org Credentials */}
        <div className="space-y-8">
          <div>
            <h3 className="font-serif text-xl font-bold text-[#1C1A17] border-b border-stone-200 pb-2 mb-4">
              Verificación de Organización
            </h3>
            <QRCodeBlock
              value={orgUrl}
              label="Escanea para validar el registro oficial de la organización."
            />
          </div>

          <div className="space-y-4">
            <h3 className="font-serif text-xl font-bold text-[#1C1A17] border-b border-stone-200 pb-2">
              Credenciales Verificables
            </h3>

            {credentials.length === 0 ? (
              <div className="text-xs text-stone-400 italic py-4">
                No hay credenciales oficiales emitidas para esta organización.
              </div>
            ) : (
              <div className="space-y-4">
                {credentials.map(c => (
                  <div 
                    key={c.id}
                    onClick={() => router.push(`/credencial/${c.credential_code}`)}
                    className="border border-stone-200/60 rounded-xl p-4 bg-white hover:border-[#C5A880]/60 transition-all cursor-pointer flex items-center justify-between group text-left"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-stone-800 group-hover:text-[#5C061E] transition-colors leading-tight">
                        {c.title}
                      </h4>
                      <span className="text-[9px] font-mono text-stone-400 block mt-1">
                        {c.credential_code}
                      </span>
                    </div>
                    <Award className="w-5 h-5 text-[#C5A880] flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
