'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, User, ShieldCheck, Award, Link as LinkIcon, AlertCircle, Key } from 'lucide-react';
import { PublicLayout } from '../../../components/PublicLayout';
import { db, Entity, Person, Credential, Relationship } from '../../../lib/db';
import { PassportCard } from '../../../components/PassportCard';
import { CredentialCard } from '../../../components/CredentialCard';
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
        const data = await db.getPersonByEntitySlug(slug);
        if (!data) {
          setIsLoading(false);
          return;
        }
        setPerson(data);

        // Find associated school (relationship: member_of, teacher_at, director_of)
        const rels = await db.getRelationships();
        const schoolRel = rels.find(
          r => r.from_entity_id === data.entity_id && 
          (r.relationship_type === 'member_of' || r.relationship_type === 'teacher_at' || r.relationship_type === 'director_of') &&
          r.toEntity?.type === 'organization'
        );
        if (schoolRel && schoolRel.toEntity) {
          setSchoolName(schoolRel.toEntity.display_name);
        }

        // Find associated credentials
        const creds = await db.getCredentials();
        const userCreds = creds.filter(c => c.subject_entity_id === data.entity_id && c.status === 'issued');
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
            Pasaporte Cultural Oficial
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
              Verificación QR
            </h2>
            <QRCodeBlock
              value={passportUrl}
              label="Escanea para verificar la validez de este pasaporte en vivo."
            />
          </div>

          <div className="space-y-4">
            <h2 className="font-serif text-xl font-bold text-[#1C1A17] border-b border-stone-200 pb-2">
              Acreditaciones y Credenciales
            </h2>

            {credentials.length === 0 ? (
              <div className="text-xs text-stone-400 italic py-4">
                No hay credenciales verificadas vigentes para esta persona.
              </div>
            ) : (
              <div className="space-y-4">
                {credentials.map(c => {
                  const issuer = db.getEntityById(c.issuer_entity_id);
                  // We'll render a smaller interactive preview that redirects to the validation page
                  return (
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
