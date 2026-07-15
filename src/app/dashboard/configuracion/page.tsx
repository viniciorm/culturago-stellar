'use client';

import React, { useEffect, useState } from 'react';
import { 
  Settings, 
  Database, 
  RefreshCw, 
  Link2, 
  HelpCircle,
  ShieldCheck,
  AlertTriangle,
  FolderOpen
} from 'lucide-react';
import { 
  db, 
  isSupabaseConfigured, 
  mockDb, 
  Entity
} from '../../../lib/db';
import { Button } from '../../../components/ui/Button';
import { RelationshipManager } from '../../../components/RelationshipManager';

export default function ConfiguracionPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    entities: 0,
    people: 0,
    organizations: 0,
    providers: 0,
    relationships: 0,
    credentials: 0,
    wallets: 0,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const entData = await db.getEntities();
      setEntities(entData);

      // Extract statistics
      if (isSupabaseConfigured) {
        // Query real supabase counts (since we can read from mock db in mock mode)
        setStats({
          entities: entData.length,
          people: (await db.getPeople()).length,
          organizations: (await db.getOrganizations()).length,
          providers: (await db.getProviders()).length,
          relationships: (await db.getRelationships()).length,
          credentials: (await db.getCredentials()).length,
          wallets: 0, // Mock wallets length
        });
      } else {
        setStats({
          entities: mockDb.entities.length,
          people: mockDb.people.length,
          organizations: mockDb.organizations.length,
          providers: mockDb.providers.length,
          relationships: mockDb.relationships.length,
          credentials: mockDb.credentials.length,
          wallets: mockDb.wallets.length,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleResetDb = () => {
    if (confirm('¿Estás completamente seguro de querer reiniciar la base de datos mock local a los datos semilla? Se perderán todas tus modificaciones locales.')) {
      mockDb.reset();
      window.location.reload();
    }
  };

  return (
    <div className="space-y-8 text-left">
      {/* Header */}
      <div className="border-b border-stone-200 pb-5">
        <h1 className="font-serif text-2xl font-bold text-[#1C1A17] flex items-center gap-2">
          <Settings className="w-6 h-6 text-[#C5A880]" />
          Configuración y Administración del Sistema
        </h1>
        <p className="text-xs text-stone-500 mt-1">Monitorea el estado del motor de datos y vincula relaciones entre artistas, escuelas y proveedores.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Database state & stats */}
        <div className="space-y-6 lg:col-span-1">
          {/* DB Engine Info */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-stone-750 flex items-center gap-2 border-b border-stone-100 pb-2">
              <Database className="w-4.5 h-4.5 text-[#C5A880]" />
              Estado del Motor de Datos
            </h3>

            {isSupabaseConfigured ? (
              <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Conexión Supabase Activa
                </div>
                <p className="leading-relaxed opacity-95">
                  El sistema está conectado a Supabase en la nube. Las operaciones CRUD se guardan directamente en tu base de datos relacional PostgreSQL.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 text-amber-800 border border-amber-100 rounded-lg text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Modo Local Mock Activo
                </div>
                <p className="leading-relaxed opacity-95">
                  No se detectaron variables de entorno de Supabase en tu archivo <code className="font-mono bg-amber-100 px-1 rounded">.env.local</code>. El sistema está corriendo localmente con persistencia en <code className="font-mono bg-amber-100 px-1 rounded">localStorage</code>.
                </p>
              </div>
            )}

            {/* Actions for local db */}
            {!isSupabaseConfigured && (
              <div className="pt-2 text-xs">
                <span className="text-stone-400 block mb-2 leading-relaxed">
                  Puedes resetear los datos a los valores semilla preestablecidos de la danza oriental en Chile.
                </span>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="w-full justify-center text-xs font-semibold"
                  onClick={handleResetDb}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Restablecer Datos Semilla
                </Button>
              </div>
            )}
          </div>

          {/* Table Counts */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-stone-750 flex items-center gap-2 border-b border-stone-100 pb-2">
              <FolderOpen className="w-4.5 h-4.5 text-[#C5A880]" />
              Auditoría de Tablas (CRUD)
            </h3>

            <div className="space-y-2.5 text-xs text-stone-600">
              <div className="flex justify-between">
                <span>Entidades Totales (entities):</span>
                <span className="font-bold text-[#1C1A17]">{stats.entities}</span>
              </div>
              <div className="flex justify-between">
                <span>Personas (people):</span>
                <span className="font-bold text-[#1C1A17]">{stats.people}</span>
              </div>
              <div className="flex justify-between">
                <span>Organizaciones (organizations):</span>
                <span className="font-bold text-[#1C1A17]">{stats.organizations}</span>
              </div>
              <div className="flex justify-between">
                <span>Proveedores (providers):</span>
                <span className="font-bold text-[#1C1A17]">{stats.providers}</span>
              </div>
              <div className="flex justify-between">
                <span>Relaciones (relationships):</span>
                <span className="font-bold text-[#1C1A17]">{stats.relationships}</span>
              </div>
              <div className="flex justify-between">
                <span>Credenciales (credentials):</span>
                <span className="font-bold text-[#1C1A17]">{stats.credentials}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right 2 Columns: Relationship Manager */}
        <div className="lg:col-span-2 bg-white border border-stone-200 rounded-xl p-6 shadow-xs space-y-4">
          <h3 className="text-base font-serif font-bold text-stone-850 flex items-center gap-2 border-b border-stone-100 pb-2">
            <Link2 className="w-5 h-5 text-[#C5A880]" />
            Administrador de Relaciones
          </h3>
          <p className="text-xs text-stone-400 leading-relaxed mb-4">
            Asocia a las bailarinas con sus escuelas, vincula a los fotógrafos con el festival u organiza quién dirige cada escuela del FDVC 2026.
          </p>

          {loading ? (
            <div className="text-stone-400 py-6 text-center">Cargando vinculador...</div>
          ) : (
            <RelationshipManager
              entities={entities}
              onUpdate={() => {
                loadData();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
