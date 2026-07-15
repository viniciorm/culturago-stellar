'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Building2, Search, Trash2, Edit2, Cpu, ExternalLink } from 'lucide-react';
import { db, Entity, Organization } from '../../../lib/db';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { StellarStatusBadge, StatusBadge } from '../../../components/ui/Badge';
import { Dialog } from '../../../components/ui/Dialog';
import { OrganizationForm } from '../../../components/OrganizationForm';

export default function OrganizacionesCRUDPage() {
  const [orgs, setOrgs] = useState<(Organization & { entity: Entity })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);

  const loadOrgs = async () => {
    setLoading(true);
    try {
      const data = await db.getOrganizations();
      setOrgs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrgs();
  }, []);

  const handleCreateSubmit = async (entityData: any, orgData: any) => {
    await db.createOrganization(entityData, orgData);
    setIsAddOpen(false);
    loadOrgs();
  };

  const handleEditSubmit = async (entityData: any, orgData: any) => {
    if (selectedEntity) {
      await db.updateOrganization(selectedEntity.id, entityData, orgData);
      setSelectedEntity(null);
      setSelectedOrg(null);
      loadOrgs();
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Estás seguro de que deseas eliminar este registro? Se borrarán de forma definitiva todos sus vínculos y credenciales asociadas.')) {
      await db.deleteEntity(id);
      loadOrgs();
    }
  };

  const handleOpenEdit = (item: Organization & { entity: Entity }) => {
    setSelectedEntity(item.entity);
    setSelectedOrg(item);
  };

  const filteredOrgs = orgs.filter(o => 
    o.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.entity.display_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const types: Record<string, string> = {
    school: 'Escuela / Academia',
    academy: 'Academia',
    company: 'Compañía',
    association: 'Asociación',
    producer: 'Productora',
    community: 'Comunidad',
    festival: 'Festival',
    other: 'Otro',
  };

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#1C1A17]">Registro de Organizaciones</h1>
          <p className="text-xs text-stone-500 mt-1">Escuelas de danza, productoras y asociaciones culturales.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setIsAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Añadir Organización
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
            onChange={(e) => setSearchTerm(e.target.value)}
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
              header: 'Organización',
              accessor: (row) => (
                <div className="flex items-center gap-2 text-left">
                  <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 flex-shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-stone-850 block leading-tight">{row.name}</span>
                    <span className="text-[10px] text-stone-450 block mt-0.5">{row.instagram || 'Instagram no registrado'}</span>
                  </div>
                </div>
              ),
            },
            {
              header: 'Tipo',
              accessor: (row) => (
                <span className="text-xs font-semibold text-[#5C061E] bg-[#5C061E]/5 px-2.5 py-0.5 rounded">
                  {types[row.organization_type] || row.organization_type}
                </span>
              ),
            },
            {
              header: 'Contacto Responsable',
              accessor: (row) => (
                <div className="flex flex-col text-xs text-left">
                  <span>{row.contact_name || '-'}</span>
                  <span className="text-stone-400">{row.contact_email || '-'}</span>
                </div>
              ),
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
                  <a href={`/o/${row.entity.slug}`} target="_blank" rel="noreferrer">
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
          data={filteredOrgs}
        />
      )}

      {/* Add Modal */}
      <Dialog isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Agregar Nueva Organización">
        <OrganizationForm onSubmit={handleCreateSubmit} onCancel={() => setIsAddOpen(false)} />
      </Dialog>

      {/* Edit Modal */}
      <Dialog isOpen={!!selectedEntity} onClose={() => { setSelectedEntity(null); setSelectedOrg(null); }} title="Editar Organización">
        <OrganizationForm
          initialEntity={selectedEntity}
          initialOrg={selectedOrg}
          onSubmit={handleEditSubmit}
          onCancel={() => { setSelectedEntity(null); setSelectedOrg(null); }}
        />
      </Dialog>
    </div>
  );
}
