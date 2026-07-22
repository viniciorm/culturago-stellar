'use client';

import React, { useEffect, useState } from 'react';
import { Plus, User, Search, Trash2, Edit2, Cpu, ExternalLink } from 'lucide-react';
import { db, Entity, Person } from '../../../lib/db';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { StellarStatusBadge, StatusBadge } from '../../../components/ui/Badge';
import { Dialog } from '../../../components/ui/Dialog';
import { PersonForm } from '../../../components/PersonForm';

export default function PersonasCRUDPage() {
  const [people, setPeople] = useState<(Person & { entity: Entity })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);

  const loadPeople = async () => {
    setLoading(true);
    try {
      const data = await db.getPeople();
      setPeople(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPeople();
  }, []);

  const handleCreateSubmit = async (entityData: any, personData: any) => {
    await db.createPerson(entityData, personData);
    setIsAddOpen(false);
    loadPeople();
  };

  const handleEditSubmit = async (entityData: any, personData: any) => {
    if (selectedEntity) {
      await db.updatePerson(selectedEntity.id, entityData, personData);
      setSelectedEntity(null);
      setSelectedPerson(null);
      loadPeople();
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Estás seguro de que deseas eliminar este registro? Se borrarán de forma definitiva todos sus vínculos y credenciales asociadas.')) {
      await db.deleteEntity(id);
      loadPeople();
    }
  };

  const handleOpenEdit = (item: Person & { entity: Entity }) => {
    setSelectedEntity(item.entity);
    setSelectedPerson(item);
  };

  const filteredPeople = people.filter(p => 
    p.artistic_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.entity.display_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const roles: Record<string, string> = {
    dancer: 'Bailarina',
    teacher: 'Profesora',
    director: 'Directora',
    judge: 'Jurado',
    guest: 'Invitada',
    staff: 'Staff',
    other: 'Otro',
  };

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#1C1A17]">Registro General de Personas</h1>
          <p className="text-xs text-stone-500 mt-1">Bailarinas, profesoras, directivas e invitadas del sistema.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setIsAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Añadir Persona
        </Button>
      </div>

      {/* Filters */}
      <div className="flex max-w-xs">
        <div className="relative w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-stone-200 rounded-lg outline-none text-xs focus:border-[#5C061E]"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-stone-400 py-12 text-center">Cargando registros...</div>
      ) : (
        <Table
          columns={[
            {
              header: 'Artista / Persona',
              accessor: (row) => (
                <div className="flex items-center gap-2 text-left">
                  <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 flex-shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-stone-850 block leading-tight">{row.artistic_name}</span>
                    <span className="text-[10px] text-stone-400 block mt-0.5">{row.legal_name || 'Nombre legal no registrado'}</span>
                  </div>
                </div>
              ),
            },
            {
              header: 'Rol Principal',
              accessor: (row) => (
                <span className="text-xs font-medium text-stone-600 bg-stone-50 border border-stone-150 px-2 py-0.5 rounded">
                  {roles[row.main_role] || row.main_role}
                </span>
              ),
            },
            {
              header: 'Ciudad / País',
              accessor: (row) => `${row.entity.city}, ${row.entity.country}`,
            },
            {
              header: 'Stellar Status',
              accessor: (row) => <StellarStatusBadge status={row.entity.stellar_status} />,
            },
            {
              header: 'Acciones',
              accessor: (row) => (
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" size="sm" className="text-xs" onClick={() => handleOpenEdit(row)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <a href={`/p/${row.entity.slug}`} target="_blank" rel="noreferrer">
                    <Button variant="secondary" size="sm" className="text-xs">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </a>
                  <Button variant="danger" size="sm" className="text-xs" onClick={() => handleDelete(row.entity_id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ),
              className: 'w-36 text-right',
            },
          ]}
          data={filteredPeople}
        />
      )}

      {/* Add Modal */}
      <Dialog isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Agregar Nueva Persona">
        <PersonForm onSubmit={handleCreateSubmit} onCancel={() => setIsAddOpen(false)} />
      </Dialog>

      {/* Edit Modal */}
      <Dialog isOpen={!!selectedEntity} onClose={() => { setSelectedEntity(null); setSelectedPerson(null); }} title="Editar Persona">
        <PersonForm
          initialEntity={selectedEntity}
          initialPerson={selectedPerson}
          onSubmit={handleEditSubmit}
          onCancel={() => { setSelectedEntity(null); setSelectedPerson(null); }}
        />
      </Dialog>
    </div>
  );
}
