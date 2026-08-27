'use client';

import React, { useEffect, useState } from 'react';
import { Settings, Link2 } from 'lucide-react';
import { type Entity } from '@/domain/types/entities';
import { listEntities } from '../credenciales/actions';
import { RelationshipManager } from '../../../components/RelationshipManager';

export default function ConfiguracionPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const entData = await listEntities();
      setEntities(entData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

      <div className="grid grid-cols-1 gap-8 items-start">
        <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-xs space-y-4">
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
