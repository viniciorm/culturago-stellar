'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Truck, Search, Trash2, Edit2, Cpu, ExternalLink } from 'lucide-react';
import { db, Entity, Provider } from '../../../lib/db';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { StellarStatusBadge, StatusBadge } from '../../../components/ui/Badge';
import { Dialog } from '../../../components/ui/Dialog';
import { ProviderForm } from '../../../components/ProviderForm';

export default function ProveedoresCRUDPage() {
  const [providers, setProviders] = useState<(Provider & { entity: Entity })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);

  const loadProviders = async () => {
    setLoading(true);
    try {
      const data = await db.getProviders();
      setProviders(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const handleCreateSubmit = async (entityData: any, providerData: any) => {
    await db.createProvider(entityData, providerData);
    setIsAddOpen(false);
    loadProviders();
  };

  const handleEditSubmit = async (entityData: any, providerData: any) => {
    if (selectedEntity) {
      await db.updateProvider(selectedEntity.id, entityData, providerData);
      setSelectedEntity(null);
      setSelectedProvider(null);
      loadProviders();
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Estás seguro de que deseas eliminar este registro? Se borrarán de forma definitiva todos sus vínculos y credenciales asociadas.')) {
      await db.deleteEntity(id);
      loadProviders();
    }
  };

  const handleOpenEdit = (item: Provider & { entity: Entity }) => {
    setSelectedEntity(item.entity);
    setSelectedProvider(item);
  };

  const filteredProviders = providers.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.entity.display_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const types: Record<string, string> = {
    photographer: 'Fotografía',
    videographer: 'Video / Producción',
    venue: 'Sede / Teatro',
    pub: 'Restaurante / Pub',
    foodtruck: 'Foodtruck',
    sound: 'Sonidista',
    lighting: 'Iluminación',
    sponsor: 'Auspiciador',
    streaming: 'Transmisión',
    makeup: 'Maquillador/a',
    costume: 'Vestuario',
    ticketing: 'Entradas',
    transport: 'Transporte',
    security: 'Seguridad',
    other: 'Otros',
  };

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#1C1A17]">Registro de Proveedores Culturales</h1>
          <p className="text-xs text-stone-500 mt-1">Fotógrafos, teatros, sonidistas y auspiciadores del festival.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setIsAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Añadir Proveedor
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
            onChange={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
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
              header: 'Proveedor',
              accessor: (row) => (
                <div className="flex items-center gap-2 text-left">
                  <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 flex-shrink-0">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-stone-850 block leading-tight">{row.name}</span>
                    <span className="text-[10px] text-stone-450 block mt-0.5">{row.instagram || 'Instagram no registrado'}</span>
                  </div>
                </div>
              ),
            },
            {
              header: 'Servicio',
              accessor: (row) => (
                <span className="text-xs font-semibold text-stone-700 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                  {types[row.provider_type] || row.provider_type}
                </span>
              ),
            },
            {
              header: 'Contacto Responsable',
              accessor: (row) => (
                <div className="flex flex-col text-xs text-left">
                  <span>{row.contact_name || '-'}</span>
                  <span className="text-stone-400">{row.email || row.phone || '-'}</span>
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
                  <a href={`/proveedor/${row.entity.slug}`} target="_blank" rel="noreferrer">
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
          data={filteredProviders}
        />
      )}

      {/* Add Modal */}
      <Dialog isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Agregar Nuevo Proveedor">
        <ProviderForm onSubmit={handleCreateSubmit} onCancel={() => setIsAddOpen(false)} />
      </Dialog>

      {/* Edit Modal */}
      <Dialog isOpen={!!selectedEntity} onClose={() => { setSelectedEntity(null); setSelectedProvider(null); }} title="Editar Proveedor">
        <ProviderForm
          initialEntity={selectedEntity}
          initialProvider={selectedProvider}
          onSubmit={handleEditSubmit}
          onCancel={() => { setSelectedEntity(null); setSelectedProvider(null); }}
        />
      </Dialog>
    </div>
  );
}
