'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Truck, ShieldCheck, Award, MapPin, Globe, Mail, Phone, User } from 'lucide-react';
import { PublicLayout } from '../../../components/PublicLayout';
import { db, Entity, Provider, Credential } from '../../../lib/db';
import { QRCodeBlock } from '../../../components/ui/QRCodeBlock';
import { StatusBadge, StellarStatusBadge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';

export default function ProviderPublicPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [provider, setProvider] = useState<(Provider & { entity: Entity }) | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadProviderData() {
      try {
        const data = await db.getProviderByEntitySlug(slug);
        if (!data) {
          setIsLoading(false);
          return;
        }
        setProvider(data);

        // Find credentials
        const creds = await db.getCredentials();
        const providerCreds = creds.filter(c => c.subject_entity_id === data.entity_id && c.status === 'issued');
        setCredentials(providerCreds);

      } catch (e) {
        console.error('Error loading public provider data:', e);
      } finally {
        setIsLoading(false);
      }
    }

    if (slug) {
      loadProviderData();
    }
  }, [slug]);

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center py-20 text-stone-400">
          Cargando perfil de proveedor...
        </div>
      </PublicLayout>
    );
  }

  if (!provider) {
    return (
      <PublicLayout>
        <div className="max-w-md mx-auto text-center py-20 space-y-4">
          <h2 className="text-xl font-bold text-[#1C1A17] font-serif">Proveedor no encontrado</h2>
          <p className="text-stone-500 text-sm">
            El proveedor con el identificador <span className="font-mono">{slug}</span> no se encuentra registrado en CulturaGO.
          </p>
          <Button variant="secondary" onClick={() => router.push('/')}>
            Volver al Portal
          </Button>
        </div>
      </PublicLayout>
    );
  }

  const getProviderTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      photographer: 'Fotografía Profesional Oficial',
      videographer: 'Filmación y Producción Audiovisual',
      venue: 'Sede Oficial / Teatro',
      pub: 'Restaurante / Pub Oficial',
      foodtruck: 'Foodtruck / Alimentación',
      sound: 'Ingeniería de Sonido',
      lighting: 'Diseño de Iluminación',
      sponsor: 'Auspiciador / Patrocinador',
      streaming: 'Transmisión / Streaming',
      security: 'Servicio de Seguridad',
      makeup: 'Maquillaje y Estilismo',
      costume: 'Indumentaria y Trajes',
      ticketing: 'Boletería y Entradas',
      transport: 'Transporte y Traslado',
      other: 'Proveedor Oficial de Servicios',
    };
    return types[type] || 'Proveedor Oficial';
  };

  const providerUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/proveedor/${provider.entity.slug}`
    : `https://culturago.stellar.app/proveedor/${provider.entity.slug}`;

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
        {/* Left Columns: Provider Card and Public details */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-[#FCFBF7] border-2 border-stone-200/60 rounded-2xl p-6 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-36 h-36 rounded-full border border-[#C5A880]/15 pointer-events-none" />
            
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-[#5C061E]/5 rounded-xl border border-[#5C061E]/10">
                <Truck className="w-6 h-6 text-[#C5A880]" />
              </div>
              <StatusBadge status={provider.entity.status} />
            </div>

            <h1 className="font-serif text-3xl font-bold text-[#1C1A17]">{provider.name}</h1>
            <p className="text-xs font-bold text-[#C5A880] mt-1.5 uppercase tracking-wider">
              {getProviderTypeLabel(provider.provider_type)}
            </p>

            {provider.public_description && (
              <div className="mt-6 p-4 bg-stone-50 border border-stone-200/50 rounded-xl text-stone-600 text-sm leading-relaxed">
                {provider.public_description}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5 mt-6 border-t border-stone-200/50 text-xs text-stone-600">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-stone-400" />
                <span>{provider.entity.city}, {provider.entity.country}</span>
              </div>
              {provider.instagram && (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
                  <a href={`https://instagram.com/${provider.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" className="hover:underline">
                    {provider.instagram}
                  </a>
                </div>
              )}
              {provider.website && (
                <div className="flex items-center gap-2 col-span-2">
                  <Globe className="w-4 h-4 text-stone-400" />
                  <a href={provider.website} target="_blank" rel="noreferrer" className="hover:underline text-[#5C061E] font-semibold">
                    {provider.website}
                  </a>
                </div>
              )}
            </div>

            {/* Public Contact Details (If they exist) */}
            {(provider.contact_name || provider.email || provider.phone) && (
              <div className="mt-6 pt-5 border-t border-stone-200/50 space-y-3">
                <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider">Contacto Público Comercial</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-stone-600">
                  {provider.contact_name && (
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-stone-400" />
                      <span>{provider.contact_name}</span>
                    </div>
                  )}
                  {provider.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-stone-400" />
                      <span>{provider.phone}</span>
                    </div>
                  )}
                  {provider.email && (
                    <div className="flex items-center gap-2 col-span-2">
                      <Mail className="w-3.5 h-3.5 text-stone-400" />
                      <span>{provider.email}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-6 pt-3 border-t border-stone-100 flex items-center justify-between">
              <span className="text-[10px] text-stone-400 uppercase font-bold">Verificación Blockchain:</span>
              <StellarStatusBadge status={provider.entity.stellar_status} />
            </div>
          </div>
        </div>

        {/* Right Column: QR and Provider Credentials */}
        <div className="space-y-8">
          <div>
            <h3 className="font-serif text-xl font-bold text-[#1C1A17] border-b border-stone-200 pb-2 mb-4">
              Verificación de Proveedor
            </h3>
            <QRCodeBlock
              value={providerUrl}
              label="Escanea para validar la acreditación oficial del proveedor cultural."
            />
          </div>

          <div className="space-y-4">
            <h3 className="font-serif text-xl font-bold text-[#1C1A17] border-b border-stone-200 pb-2">
              Credenciales Verificables
            </h3>

            {credentials.length === 0 ? (
              <div className="text-xs text-stone-400 italic py-4">
                No hay credenciales vigentes emitidas para este proveedor.
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
