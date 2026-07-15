'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Calendar, 
  Users, 
  Building2, 
  Truck, 
  Award, 
  Sparkles,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { EventSummaryCards } from '../../components/EventSummaryCards';
import { db, Entity, isSupabaseConfigured } from '../../lib/db';
import { Button } from '../../components/ui/Button';

export default function DashboardHome() {
  const [stats, setStats] = useState({
    schools: 0,
    dancers: 0,
    teachers: 0,
    providers: 0,
    credentialsIssued: 0,
    pendingStellar: 0,
    registeredStellar: 0,
    walletsClaimed: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const entities = await db.getEntities();
        const people = await db.getPeople();
        const orgs = await db.getOrganizations();
        const providers = await db.getProviders();
        const credentials = await db.getCredentials();

        const schoolCount = orgs.filter(o => o.organization_type === 'school').length;
        const dancerCount = people.filter(p => p.main_role === 'dancer').length;
        const teacherCount = people.filter(p => p.main_role === 'teacher' || p.main_role === 'director').length;
        const providerCount = providers.length;
        
        const credentialsIssuedCount = credentials.filter(c => c.status === 'issued').length;
        
        const registeredCount = entities.filter(e => e.stellar_status === 'registered').length + 
                               credentials.filter(c => c.stellar_status === 'registered').length;
        const pendingCount = entities.filter(e => e.stellar_status === 'pending' || e.stellar_status === 'not_registered').length +
                             credentials.filter(c => c.stellar_status === 'pending' || c.stellar_status === 'not_registered').length;

        const walletsClaimedCount = entities.filter(e => e.wallet_status === 'claimed').length;

        setStats({
          schools: schoolCount,
          dancers: dancerCount,
          teachers: teacherCount,
          providers: providerCount,
          credentialsIssued: credentialsIssuedCount,
          pendingStellar: pendingCount,
          registeredStellar: registeredCount,
          walletsClaimed: walletsClaimedCount,
        });

      } catch (e) {
        console.error('Error loading dashboard stats:', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="space-y-8 text-left">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#1C1A17]">Resumen del Sistema</h1>
          <p className="text-xs text-stone-500 mt-1">CulturaGO • Panel de Acreditación y Pasaportes</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1 bg-stone-200 text-stone-700 rounded-md border border-stone-300">
            FDVC 2026 Admin
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-12 text-center">Cargando métricas...</div>
      ) : (
        <>
          {/* Statistics widgets */}
          <EventSummaryCards stats={stats} />

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Active pilot info */}
            <div className="md:col-span-2 bg-[#FCFBF7] border border-stone-200 rounded-xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-[#5C061E] bg-[#5C061E]/5 px-2 py-0.5 rounded mb-4">
                  <Sparkles className="w-3 h-3 text-[#C5A880]" />
                  Evento Destacado Activo
                </div>
                <h3 className="text-lg font-serif font-bold text-[#1C1A17] leading-snug">
                  Festival Nacional Danza del Vientre Chile 2026
                </h3>
                <p className="text-xs text-stone-500 mt-2 leading-relaxed">
                  Estás administrando el evento FDVC 2026. Los pasaportes emitidos aquí se integran de forma automática a la red de acreditación del festival. Puedes emitir credenciales, registrar escuelas participantes y auditar la integridad de los datos en Stellar.
                </p>
              </div>

              <div className="mt-6">
                <Link href="/dashboard/eventos/fdvc-2026">
                  <Button variant="primary" size="sm">
                    Ir al Evento Principal
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Quick Actions Shortcuts */}
            <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-xs space-y-4">
              <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider">Accesos Directos</h4>
              <div className="flex flex-col gap-2.5 text-xs font-semibold">
                <Link 
                  href="/dashboard/personas" 
                  className="flex items-center justify-between p-2.5 bg-stone-50 hover:bg-[#5C061E]/5 rounded-lg border border-stone-200/50 text-stone-700 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#C5A880]" />
                    Administrar Personas
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-stone-400" />
                </Link>

                <Link 
                  href="/dashboard/organizaciones" 
                  className="flex items-center justify-between p-2.5 bg-stone-50 hover:bg-[#5C061E]/5 rounded-lg border border-stone-200/50 text-stone-700 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#C5A880]" />
                    Administrar Organizaciones
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-stone-400" />
                </Link>

                <Link 
                  href="/dashboard/proveedores" 
                  className="flex items-center justify-between p-2.5 bg-stone-50 hover:bg-[#5C061E]/5 rounded-lg border border-stone-200/50 text-stone-700 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-[#C5A880]" />
                    Administrar Proveedores
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-stone-400" />
                </Link>

                <Link 
                  href="/dashboard/credenciales" 
                  className="flex items-center justify-between p-2.5 bg-stone-50 hover:bg-[#5C061E]/5 rounded-lg border border-stone-200/50 text-stone-700 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-[#C5A880]" />
                    Emitir / Revocar Credenciales
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-stone-400" />
                </Link>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
