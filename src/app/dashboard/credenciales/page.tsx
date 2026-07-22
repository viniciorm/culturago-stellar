'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Award, Search, Trash2, Cpu, ExternalLink } from 'lucide-react';
import { db, Entity, PopulatedCredential } from '../../../lib/db';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { StatusBadge, StellarStatusBadge } from '../../../components/ui/Badge';
import { Dialog } from '../../../components/ui/Dialog';
import { CredentialForm } from '../../../components/CredentialForm';
import { StellarStatusBlock } from '../../../components/StellarStatusBlock';

export default function CredencialesCRUDPage() {
  const [credentials, setCredentials] = useState<PopulatedCredential[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedCredential, setSelectedCredential] = useState<PopulatedCredential | null>(null);
  const [isStellarOpen, setIsStellarOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const credData = await db.getCredentials();
      setCredentials(credData);

      const entData = await db.getEntities();
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

  const handleCreateSubmit = async (credentialData: any) => {
    await db.createCredential(credentialData);
    setIsAddOpen(false);
    loadData();
  };

  const handleRevoke = async (id: string) => {
    if (confirm('¿Estás seguro de que deseas revocar esta credencial? Esta acción quedará registrada en la red Stellar.')) {
      await db.updateCredential(id, { status: 'revoked', revoked_at: new Date().toISOString() });
      loadData();
    }
  };

  const handleOpenStellar = (cred: PopulatedCredential) => {
    setSelectedCredential(cred);
    setIsStellarOpen(true);
  };

  const filteredCreds = credentials.filter(c => 
    c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.credential_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.subjectEntity?.display_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#1C1A17]">Registro de Credenciales</h1>
          <p className="text-xs text-stone-500 mt-1">Acreditaciones oficiales emitidas por organizaciones del festival.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setIsAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Emitir Credencial
        </Button>
      </div>

      {/* Filters */}
      <div className="flex max-w-xs">
        <div className="relative w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
          <input
            type="text"
            placeholder="Buscar por código, título o sujeto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
            className="w-full pl-9 pr-4 py-2 border border-stone-200 rounded-lg outline-none text-xs focus:border-[#5C061E]"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-stone-400 py-12 text-center">Cargando credenciales...</div>
      ) : (
        <Table
          columns={[
            {
              header: 'Código',
              accessor: (row) => <span className="font-mono text-xs font-bold text-stone-700">{row.credential_code}</span>,
            },
            {
              header: 'Credencial / Acreditación',
              accessor: (row) => (
                <div className="flex items-center gap-2 text-left">
                  <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-400 flex-shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-stone-850 block leading-tight">{row.title}</span>
                    <span className="text-[10px] text-stone-400 block mt-0.5">Otorgada a: {row.subjectEntity?.display_name || 'Sujeto desconocido'}</span>
                  </div>
                </div>
              ),
            },
            {
              header: 'Emisor',
              accessor: (row) => row.issuerEntity?.display_name || 'Organizador',
            },
            {
              header: 'Estado',
              accessor: (row) => <StatusBadge status={row.status} />,
            },
            {
              header: 'Stellar Status',
              accessor: (row) => <StellarStatusBadge status={row.stellar_status} />,
            },
            {
              header: 'Acciones',
              accessor: (row) => (
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" size="sm" className="text-xs" onClick={() => handleOpenStellar(row)}>
                    <Cpu className="w-3.5 h-3.5" />
                  </Button>
                  <a href={`/credencial/${row.credential_code}`} target="_blank" rel="noreferrer">
                    <Button variant="secondary" size="sm" className="text-xs">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </a>
                  {row.status === 'issued' && (
                    <Button variant="danger" size="sm" className="text-xs" onClick={() => handleRevoke(row.id)}>
                      Revocar
                    </Button>
                  )}
                </div>
              ),
              className: 'w-48 text-right',
            },
          ]}
          data={filteredCreds}
        />
      )}

      {/* Add Modal */}
      <Dialog isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Emitir Credencial Verificable">
        <CredentialForm entities={entities} onSubmit={handleCreateSubmit} onCancel={() => setIsAddOpen(false)} />
      </Dialog>

      {/* Stellar Modal */}
      <Dialog isOpen={isStellarOpen} onClose={() => { setIsStellarOpen(false); setSelectedCredential(null); }} title="Detalles Blockchain Stellar">
        <StellarStatusBlock
          credential={selectedCredential}
          onUpdate={() => {
            loadData();
          }}
        />
      </Dialog>
    </div>
  );
}
