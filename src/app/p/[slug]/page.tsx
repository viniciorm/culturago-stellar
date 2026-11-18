'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Award, Key } from 'lucide-react';
import { PublicLayout } from '../../../components/PublicLayout';
import {
  getPublicPersonByEntitySlug,
  getPublicRelationships,
  getPublicCredentialsBySubjectId,
} from '../../actions';
import type { Entity, Person, Credential } from '@/domain/types/entities';
import { PassportCard } from '../../../components/PassportCard';
import { QRCodeBlock } from '../../../components/ui/QRCodeBlock';
import { Button } from '../../../components/ui/Button';

export default function PersonPublicPassportPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [person, setPerson] = useState<(Person & { entity: Entity }) | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadPassportData() {
      try {
        const data = await getPublicPersonByEntitySlug(slug);
        if (!data) {
          setIsLoading(false);
          return;
        }
        setPerson(data);

        // Find associated school (relationship: member_of, teacher_at, director_of)
        const rels = await getPublicRelationships();
        const schoolRel = rels.find(
          r => r.from_entity_id === data.entity_id && 
          (r.relationship_type === 'member_of' || r.relationship_type === 'teacher_at' || r.relationship_type === 'director_of') &&
          r.toEntity?.type === 'organization'
        );
        if (schoolRel && schoolRel.toEntity) {
          setSchoolName(schoolRel.toEntity.display_name);
        }

        // Find associated credentials
        const creds = await getPublicCredentialsBySubjectId(data.entity_id);
        const userCreds = creds.filter(c => c.status === 'issued');
        setCredentials(userCreds);

      } catch (e) {
        console.error('Error loading public passport data:', e);
      } finally {
        setIsLoading(false);
      }
    }

    if (slug) {
      loadPassportData();
    }
  }, [slug]);

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center py-20 text-stone-400">
          Cargando pasaporte cultural...
        </div>
      </PublicLayout>
    );
  }

  if (!person) {
    return (
      <PublicLayout>
        <div className="max-w-md mx-auto text-center py-20 space-y-4">
          <h2 className="text-xl font-bold text-[#1C1A17] font-serif">Pasaporte no encontrado</h2>
          <p className="text-stone-500 text-sm">
            La artista con el identificador <span className="font-mono">{slug}</span> no cuenta con un pasaporte cultural registrado.
          </p>
          <Button variant="secondary" onClick={() => router.push('/')}>
            Volver al Portal
          </Button>
        </div>
      </PublicLayout>
    );
  }

  // Resolve absolute URL for QR Code
  const passportUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/p/${person.entity.slug}`
    : `https://culturago.stellar.app/p/${person.entity.slug}`;

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

      {/* Main Grid Layout: Passport card, QR validation, Credentials list */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start text-left">
        
        {/* Left Column: Visual Passport Card */}
        <div className="md:col-span-2 space-y-6">
          <h2 className="font-serif text-2xl font-bold text-[#1C1A17] border-b border-stone-200 pb-2">
            Pasaporte Cultural
          </h2>

          <PassportCard
            entity={person.entity}
            person={person}
            schoolName={schoolName}
          />

          {/* Action Call for Artist */}
          <div className="bg-[#FCFBF7] border border-stone-200/80 rounded-xl p-5 shadow-xs max-w-md mx-auto space-y-3.5">
            <div>
              <h4 className="text-sm font-bold text-[#1C1A17] flex items-center gap-1.5">
                <Key className="w-4 h-4 text-[#C5A880]" />
                ¿Eres dueña de este pasaporte?
              </h4>
              <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                Activa tu pasaporte cultural digital y enlázalo de forma segura a tu dispositivo móvil.
              </p>
            </div>
            
            <Button
              variant="secondary"
              className="w-full text-xs font-semibold border-dashed cursor-not-allowed"
              disabled
            >
              Activación con passkey próximamente
            </Button>
          </div>
        </div>

        {/* Right Column: QR verification block & credentials */}
        <div className="space-y-8">
          <div>
            <h2 className="font-serif text-xl font-bold text-[#1C1A17] border-b border-stone-200 pb-2 mb-4">
              Código QR de consulta
            </h2>
            <QRCodeBlock
              value={passportUrl}
              label="Escanea para consultar este pasaporte cultural."
            />
          </div>

          <div className="space-y-4">
            <h2 className="font-serif text-xl font-bold text-[#1C1A17] border-b border-stone-200 pb-2">
              Acreditaciones y Credenciales
            </h2>

            {credentials.length === 0 ? (
              <div className="text-xs text-stone-400 italic py-4">
                No hay credenciales registradas vigentes para esta persona.
              </div>
            ) : (
              <div className="space-y-4">
                {credentials.map(c => {
                  const isV2 = c.schema_version === 'culturago.credential.v2';
                  const targetHref =
                    c.href ??
                    (isV2 && c.public_id
                      ? `/credentials/${encodeURIComponent(c.public_id)}`
                      : `/credencial/${encodeURIComponent(c.credential_code)}`);
                  const displayLabel = isV2 ? (c.display_label || c.title) : c.title;
                  const displaySubtitle = isV2 ? c.display_subtitle : c.description;
                  const codeLabel = isV2 ? (c.public_id || c.credential_code) : c.credential_code;
                  const publicStatusLabel =
                    c.public_status_label ??
                    (c.stellar_status === 'registered'
                      ? 'Confirmada en Stellar'
                      : 'Registro local — sin confirmación Stellar');

                  return (
                    <a
                      key={c.id}
                      href={targetHref}
                      onClick={(e) => {
                        e.preventDefault();
                        router.push(targetHref);
                      }}
                      className="border border-stone-200/60 rounded-xl p-4 bg-white hover:border-[#C5A880]/60 transition-all cursor-pointer flex items-center justify-between group text-left block"
                    >
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-stone-800 group-hover:text-[#5C061E] transition-colors leading-tight">
                          {displayLabel}
                        </h4>
                        {displaySubtitle && (
                          <p className="text-[11px] text-stone-600 leading-snug">
                            {displaySubtitle}
                          </p>
                        )}
                        <span className="text-[10px] font-medium text-stone-700 bg-stone-100 border border-stone-200 rounded px-1.5 py-0.5 inline-block">
                          {publicStatusLabel}
                        </span>
                        <span className="text-[9px] font-mono text-stone-400 block">
                          {codeLabel}
                        </span>
                      </div>
                      <Award className="w-5 h-5 text-[#C5A880] shrink-0" />
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </PublicLayout>
  );
}
