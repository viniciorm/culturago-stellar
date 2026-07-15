'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Award, ShieldCheck, Calendar, ArrowRight, UserCheck, Sparkles } from 'lucide-react';
import { PublicLayout } from '../components/PublicLayout';
import { db, Entity, isSupabaseConfigured } from '../lib/db';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export default function HomePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadEntities() {
      try {
        const data = await db.getEntities();
        // filter out event itself to show only artists/orgs/providers
        setEntities(data.filter(e => e.type !== 'event'));
      } catch (e) {
        console.error('Error loading entities:', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadEntities();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    
    // Find matching entity
    const query = searchQuery.toLowerCase().trim();
    const matched = entities.find(
      e => e.display_name.toLowerCase().includes(query) || e.slug.includes(query)
    );

    if (matched) {
      if (matched.type === 'person') router.push(`/p/${matched.slug}`);
      else if (matched.type === 'organization') router.push(`/o/${matched.slug}`);
      else if (matched.type === 'provider') router.push(`/proveedor/${matched.slug}`);
    } else {
      alert('No se encontró ningún pasaporte o perfil con ese nombre en este demo.');
    }
  };

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode) return;
    router.push(`/credencial/${verifyCode.trim()}`);
  };

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="text-center py-12 md:py-20 max-w-4xl mx-auto space-y-6">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#5C061E]/5 border border-[#5C061E]/10 text-xs font-semibold text-[#5C061E]">
          <Sparkles className="w-3.5 h-3.5 text-[#C5A880]" />
          Piloto Oficial: FDVC Chile 2026
        </div>
        
        <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-[#1C1A17] leading-tight">
          Pasaportes Culturales <br />
          <span className="bg-gradient-to-r from-[#5C061E] to-[#C5A880] bg-clip-text text-transparent">
            Digitales y Verificables
          </span>
        </h1>
        
        <p className="text-base md:text-lg text-stone-500 max-w-2xl mx-auto leading-relaxed">
          CulturaGO es la plataforma de acreditación verificable para artistas, academias, profesoras y proveedores de la cultura. Conectando identidades artísticas con validación blockchain transparente.
        </p>

        <div className="pt-4 flex flex-wrap justify-center gap-4">
          <Link href="/evento/fdvc-2026">
            <Button variant="primary" size="lg">
              Ver Festival FDVC 2026
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <a href="#verify-section">
            <Button variant="secondary" size="lg">
              Verificar Credencial
            </Button>
          </a>
        </div>
      </section>

      {/* Quick Search & Verification Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto py-8">
        {/* Search Passport */}
        <div className="bg-[#FCFBF7] border border-stone-200/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-serif font-bold text-[#1C1A17] flex items-center gap-2">
              <Search className="w-5 h-5 text-[#C5A880]" />
              Buscar Pasaporte Cultural
            </h3>
            <p className="text-xs text-stone-500 mt-1 mb-4">
              Encuentra el perfil público verificado de bailarinas, profesoras u organizaciones.
            </p>
          </div>
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <Input
              placeholder="Ej. Bailarina Demo o escuela-demo"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button type="submit" variant="primary" className="h-[38px] flex-shrink-0">
              Buscar
            </Button>
          </form>
        </div>

        {/* Verify Credential Code */}
        <div id="verify-section" className="bg-[#FCFBF7] border border-stone-200/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-serif font-bold text-[#1C1A17] flex items-center gap-2">
              <Award className="w-5 h-5 text-[#C5A880]" />
              Verificar Código de Credencial
            </h3>
            <p className="text-xs text-stone-500 mt-1 mb-4">
              Ingresa el código único de la credencial para constatar su autenticidad y anclaje Stellar.
            </p>
          </div>
          <form onSubmit={handleVerifySubmit} className="flex gap-2">
            <Input
              placeholder="Ej. CRED-FDVC26-DCR-DEMO"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
            />
            <Button type="submit" variant="accent" className="h-[38px] flex-shrink-0">
              Validar
            </Button>
          </form>
        </div>
      </section>

      {/* Featured Pilot Card */}
      <section className="max-w-4xl mx-auto py-10">
        <div className="bg-[#5C061E] rounded-2xl text-white p-8 relative overflow-hidden shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 rounded-full border border-[#C5A880]/20 pointer-events-none" />
          
          <div className="space-y-3 text-left max-w-xl">
            <span className="text-xs uppercase font-bold tracking-widest text-[#C5A880]">
              Primer Piloto Real Activo
            </span>
            <h3 className="font-serif text-2xl font-bold">
              Festival Nacional Danza del Vientre Chile 2026
            </h3>
            <p className="text-xs text-stone-200 leading-relaxed">
              El evento más grande de danza oriental en el país adoptará CulturaGO para acreditar la participación de escuelas, bailarinas solistas, directoras y certificar a sus proveedores oficiales con anclaje verificable en blockchain.
            </p>
          </div>

          <Link href="/evento/fdvc-2026" className="flex-shrink-0">
            <Button variant="secondary" className="bg-[#FCFBF7] text-[#5C061E] border-none hover:bg-stone-100 py-3 px-5 font-semibold text-sm">
              Visitar Página del Evento
              <ArrowRight className="w-4 h-4 ml-2 text-[#5C061E]" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Featured cultural credentials */}
      <section className="max-w-4xl mx-auto py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xl font-bold text-[#1C1A17]">
            Artistas y Escuelas Destacadas
          </h3>
          <span className="text-xs text-stone-400 font-medium">FDVC 2026</span>
        </div>

        {isLoading ? (
          <div className="text-stone-400 py-8">Cargando portafolio...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {entities.slice(0, 3).map((entity) => (
              <Link 
                key={entity.id}
                href={
                  entity.type === 'person' ? `/p/${entity.slug}`
                  : entity.type === 'organization' ? `/o/${entity.slug}`
                  : `/proveedor/${entity.slug}`
                }
                className="bg-white hover:bg-[#FCFBF7] border border-stone-200/60 rounded-xl p-4 transition-all hover:border-[#C5A880]/40 flex items-center justify-between group shadow-xs"
              >
                <div className="text-left">
                  <h4 className="text-sm font-bold text-stone-800 group-hover:text-[#5C061E] transition-colors leading-tight">
                    {entity.display_name}
                  </h4>
                  <span className="text-[10px] uppercase font-bold text-[#C5A880] tracking-wider mt-1 block">
                    {entity.type === 'person' ? 'Artista' : entity.type === 'organization' ? 'Escuela' : 'Proveedor'}
                  </span>
                </div>
                <div className="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </PublicLayout>
  );
}
