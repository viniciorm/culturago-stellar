'use client';

import React, { useState, useEffect } from 'react';
import { Link2, Trash2, CheckCircle2, UserPlus, Info } from 'lucide-react';
import { 
  Entity, 
  Relationship, 
  PopulatedRelationship, 
  db 
} from '../lib/db';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { Table } from './ui/Table';
import { Input } from './ui/Input';

interface RelationshipManagerProps {
  entities: Entity[];
  onUpdate: () => void;
}

export const RelationshipManager: React.FC<RelationshipManagerProps> = ({
  entities,
  onUpdate,
}) => {
  const [relationships, setRelationships] = useState<PopulatedRelationship[]>([]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [relType, setRelType] = useState('participant_of');
  const [notes, setNotes] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadRelationships = async () => {
    setLoading(true);
    try {
      const data = await db.getRelationships();
      setRelationships(data);
    } catch (e) {
      console.error('Error loading relationships:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRelationships();
  }, [entities]);

  // Set default dropdowns
  useEffect(() => {
    if (entities.length > 0) {
      if (!fromId) setFromId(entities[0].id);
      if (!toId) {
        // Set to second entity if available
        const second = entities[1] ? entities[1].id : entities[0].id;
        setToId(second);
      }
    }
  }, [entities, fromId, toId]);

  const handleCreateRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fromId === toId) {
      setError('No puedes crear una relación de una entidad consigo misma.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await db.createRelationship({
        from_entity_id: fromId,
        to_entity_id: toId,
        relationship_type: relType as any,
        status: 'active',
        context_event_id: '22222222-2222-2222-2222-333333333333', // Default FDVC 2026
        notes: notes || null
      });
      setNotes('');
      await loadRelationships();
      onUpdate();
    } catch (e: any) {
      setError(e.message || 'Error al vincular las entidades.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRelationship = async (id: string) => {
    if (confirm('¿Estás seguro de que quieres desvincular estas entidades?')) {
      try {
        await db.deleteRelationship(id);
        await loadRelationships();
        onUpdate();
      } catch (e) {
        console.error('Error deleting relationship:', e);
      }
    }
  };

  const getRelationshipLabel = (type: string) => {
    const labels: Record<string, string> = {
      organizer_of: 'Organiza',
      participant_of: 'Participa en',
      member_of: 'Miembro de',
      teacher_at: 'Profesora en',
      director_of: 'Directora de',
      founder_of: 'Fundadora de',
      provider_of: 'Proveedor de',
      venue_of: 'Sede oficial de',
      sponsor_of: 'Auspiciador de',
      official_photographer_of: 'Fotógrafo oficial de',
      official_videographer_of: 'Camarógrafo oficial de',
      technical_partner_of: 'Socio técnico de',
      food_partner_of: 'Gastronomía oficial de',
      media_partner_of: 'Prensa oficial de',
    };
    return labels[type] || type;
  };

  const relTypes = [
    { value: 'participant_of', label: 'Participa en (ej. Escuela en Festival)' },
    { value: 'member_of', label: 'Miembro de (ej. Bailarina en Escuela)' },
    { value: 'teacher_at', label: 'Profesora en (ej. Maestra en Escuela)' },
    { value: 'director_of', label: 'Directora de (ej. Directora en Escuela)' },
    { value: 'official_photographer_of', label: 'Fotógrafo oficial de (ej. Proveedor en Festival)' },
    { value: 'official_videographer_of', label: 'Camarógrafo oficial de (ej. Proveedor en Festival)' },
    { value: 'provider_of', label: 'Proveedor de (ej. Sonido en Festival)' },
    { value: 'organizer_of', label: 'Organizador de' },
    { value: 'venue_of', label: 'Sede oficial de' },
    { value: 'sponsor_of', label: 'Auspiciador de' },
  ];

  const entityDropdown = entities.map(e => ({
    value: e.id,
    label: `${e.display_name} (${e.type === 'person' ? 'Persona' : e.type === 'organization' ? 'Organización' : e.type === 'provider' ? 'Proveedor' : 'Evento'})`
  }));

  const columns = [
    {
      header: 'Entidad de Origen',
      accessor: (row: PopulatedRelationship) => (
        <div className="flex flex-col text-left">
          <span className="font-semibold text-stone-800">{row.fromEntity?.display_name || 'Desconocida'}</span>
          <span className="text-[10px] text-stone-400 capitalize">{row.fromEntity?.type}</span>
        </div>
      ),
    },
    {
      header: 'Vínculo / Relación',
      accessor: (row: PopulatedRelationship) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-[#5C061E]/5 text-[#5C061E]">
          <Link2 className="w-3 h-3 mr-1" />
          {getRelationshipLabel(row.relationship_type)}
        </span>
      ),
    },
    {
      header: 'Entidad de Destino',
      accessor: (row: PopulatedRelationship) => (
        <div className="flex flex-col text-left">
          <span className="font-semibold text-stone-800">{row.toEntity?.display_name || 'Desconocida'}</span>
          <span className="text-[10px] text-stone-400 capitalize">{row.toEntity?.type}</span>
        </div>
      ),
    },
    {
      header: 'Notas / Detalles',
      accessor: (row: PopulatedRelationship) => (
        <span className="text-xs text-stone-400 italic">{row.notes || '-'}</span>
      ),
    },
    {
      header: 'Acciones',
      accessor: (row: PopulatedRelationship) => (
        <button
          onClick={() => handleDeleteRelationship(row.id)}
          className="p-1 text-stone-400 hover:text-rose-600 rounded transition-colors"
          title="Eliminar relación"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      ),
      className: 'w-10 text-center',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Create form */}
      <form onSubmit={handleCreateRelationship} className="p-5 bg-stone-50 border border-stone-200/80 rounded-xl space-y-4 text-left">
        <div className="flex items-center gap-2 border-b border-stone-200/60 pb-2 mb-2">
          <UserPlus className="w-5 h-5 text-[#C5A880]" />
          <h4 className="text-sm font-bold text-stone-700">Crear Nuevo Vínculo / Relación</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select
            label="Entidad Origen"
            options={entityDropdown}
            value={fromId}
            onChange={(e: any) => setFromId(e.target.value)}
          />
          <Select
            label="Tipo de Relación"
            options={relTypes}
            value={relType}
            onChange={(e: any) => setRelType(e.target.value)}
          />
          <Select
            label="Entidad Destino"
            options={entityDropdown}
            value={toId}
            onChange={(e: any) => setToId(e.target.value)}
          />
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <Input
              label="Notas / Rol Específico (Opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Bailarina solista estelar, Maestra del taller, etc."
            />
          </div>
          <Button variant="primary" type="submit" isLoading={submitting} className="w-full md:w-auto h-[38px] flex-shrink-0">
            Establecer Vínculo
          </Button>
        </div>

        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
      </form>

      {/* Relationships Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-stone-700">Vínculos Existentes</h4>
          <span className="text-xs text-stone-400 font-medium">Total de relaciones: {relationships.length}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-stone-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>Cargando vinculaciones...</span>
          </div>
        ) : (
          <Table
            columns={columns}
            data={relationships}
            emptyMessage="No hay relaciones o vínculos registrados."
          />
        )}
      </div>
    </div>
  );
};

// simple loading spinner placeholder
const Loader2 = ({ className, ...props }: any) => (
  <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24" {...props}>
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);
