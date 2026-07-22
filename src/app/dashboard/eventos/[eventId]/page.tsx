'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Calendar, 
  MapPin, 
  Building2, 
  Users, 
  UserCheck, 
  Truck, 
  Award, 
  QrCode, 
  Clock, 
  Plus, 
  Copy, 
  Check, 
  Download, 
  ExternalLink,
  Cpu,
  RefreshCw,
  Search
} from 'lucide-react';
import { 
  db, 
  Event, 
  Entity, 
  Person, 
  Organization, 
  Provider, 
  Credential, 
  PopulatedRelationship,
  PopulatedCredential,
  StellarStatus
} from '../../../../lib/db';
import { Button } from '../../../../components/ui/Button';
import { Tabs } from '../../../../components/ui/Tabs';
import { Table } from '../../../../components/ui/Table';
import { StatusBadge, StellarStatusBadge } from '../../../../components/ui/Badge';
import { QRCodeBlock } from '../../../../components/ui/QRCodeBlock';
import { Dialog } from '../../../../components/ui/Dialog';
import { PersonForm } from '../../../../components/PersonForm';
import { OrganizationForm } from '../../../../components/OrganizationForm';
import { ProviderForm } from '../../../../components/ProviderForm';
import { CredentialForm } from '../../../../components/CredentialForm';
import { StellarStatusBlock } from '../../../../components/StellarStatusBlock';
import { generateMetadataHash } from '../../../../lib/hashes';
import { registerEntityOnChain, issueCredentialOnChain } from '../../../../lib/stellar';

export default function EventDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string; // slug like 'fdvc-2026'

  const [event, setEvent] = useState<(Event & { entity: Entity }) | null>(null);
  const [organizer, setOrganizer] = useState<Organization | null>(null);
  
  // Database datasets
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relationships, setRelationships] = useState<PopulatedRelationship[]>([]);
  const [credentials, setCredentials] = useState<PopulatedCredential[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);

  // UI state
  const [activeTab, setActiveTab] = useState('summary');
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isAddPersonOpen, setIsAddPersonOpen] = useState(false);
  const [isAddOrgOpen, setIsAddOrgOpen] = useState(false);
  const [isAddProviderOpen, setIsAddProviderOpen] = useState(false);
  const [isIssueCredOpen, setIsIssueCredOpen] = useState(false);
  const [selectedStellarEntity, setSelectedStellarEntity] = useState<Entity | null>(null);
  const [selectedStellarCredential, setSelectedStellarCredential] = useState<Credential | null>(null);
  const [isStellarModalOpen, setIsStellarModalOpen] = useState(false);

  // Sync DB loader
  const loadDatabase = async () => {
    try {
      const ev = await db.getEventBySlug(eventId);
      if (!ev) {
        setIsLoading(false);
        return;
      }
      setEvent(ev);

      if (ev.organizer_entity_id) {
        const orgData = await db.getOrganizationByEntityId(ev.organizer_entity_id);
        setOrganizer(orgData);
      }

      // Fetch all entities & filters
      const allEntities = await db.getEntities();
      setEntities(allEntities);

      const allRels = await db.getRelationships();
      setRelationships(allRels);

      const allCreds = await db.getCredentials();
      setCredentials(allCreds);

      const allPeople = await db.getPeople();
      setPeople(allPeople);

      const allOrgs = await db.getOrganizations();
      setOrganizations(allOrgs);

      const allProviders = await db.getProviders();
      setProviders(allProviders);

    } catch (e) {
      console.error('Error loading event dashboard:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      loadDatabase();
    }
  }, [eventId]);

  // Filtering datasets related to current event
  const currentEventRels = useMemo(() => {
    if (!event) return [];
    return relationships.filter(r => r.context_event_id === event.id && r.status === 'active');
  }, [relationships, event]);

  const currentEventCredentials = useMemo(() => {
    if (!event) return [];
    return credentials.filter(c => c.event_id === event.id);
  }, [credentials, event]);

  // Filters by roles/types associated to this event
  const eventSchools = useMemo(() => {
    return currentEventRels
      .filter(r => r.fromEntity?.type === 'organization' && r.relationship_type === 'participant_of')
      .map(r => {
        const org = organizations.find(o => o.entity_id === r.from_entity_id)!;
        return { entity: r.fromEntity, org };
      })
      .filter(x => x.org && x.entity.display_name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [currentEventRels, organizations, searchTerm]);

  const eventDancers = useMemo(() => {
    // Find people participating in FDVC 2026 who are dancers
    return currentEventRels
      .filter(r => r.fromEntity?.type === 'person' && r.relationship_type === 'participant_of')
      .map(r => {
        const person = people.find(p => p.entity_id === r.from_entity_id)!;
        return { entity: r.fromEntity, person };
      })
      .filter(x => x.person && x.person.main_role === 'dancer')
      .filter(x => x.person.artistic_name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [currentEventRels, people, searchTerm]);

  const eventTeachers = useMemo(() => {
    return currentEventRels
      .filter(r => r.fromEntity?.type === 'person' && r.relationship_type === 'participant_of')
      .map(r => {
        const person = people.find(p => p.entity_id === r.from_entity_id)!;
        return { entity: r.fromEntity, person };
      })
      .filter(x => x.person && (x.person.main_role === 'teacher' || x.person.main_role === 'director'))
      .filter(x => x.person.artistic_name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [currentEventRels, people, searchTerm]);

  const eventProviders = useMemo(() => {
    return currentEventRels
      .filter(r => r.fromEntity?.type === 'provider')
      .map(r => {
        const provider = providers.find(p => p.entity_id === r.from_entity_id)!;
        return { entity: r.fromEntity, provider };
      })
      .filter(x => x.provider && x.entity.display_name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [currentEventRels, providers, searchTerm]);

  // Pending verification
  const pendingRegistrations = useMemo(() => {
    const pendingEntities = entities.filter(
      e => e.type !== 'event' && e.stellar_status !== 'registered'
    );
    const pendingCreds = credentials.filter(
      c => c.stellar_status !== 'registered' && c.status === 'issued'
    );
    return [
      ...pendingEntities.map(e => ({ id: e.id, name: e.display_name, type: 'entity', entityType: e.type, status: e.stellar_status, raw: e })),
      ...pendingCreds.map(c => ({ id: c.id, name: `${c.title} (${c.credential_code})`, type: 'credential', entityType: 'credential', status: c.stellar_status, raw: c }))
    ].filter(x => x.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [entities, credentials, searchTerm]);

  // Copy link action helper
  const handleCopyLink = (path: string, id: string) => {
    const url = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // CRUD Submissions
  const handleAddPersonSubmit = async (entityData: any, personData: any) => {
    const result = await db.createPerson(entityData, personData);
    // Link automatically to FDVC 2026
    await db.createRelationship({
      from_entity_id: result.entity_id,
      to_entity_id: event!.entity_id,
      relationship_type: 'participant_of',
      context_event_id: event!.id,
      status: 'active'
    });
    setIsAddPersonOpen(false);
    loadDatabase();
  };

  const handleAddOrgSubmit = async (entityData: any, orgData: any) => {
    const result = await db.createOrganization(entityData, orgData);
    await db.createRelationship({
      from_entity_id: result.entity_id,
      to_entity_id: event!.entity_id,
      relationship_type: 'participant_of',
      context_event_id: event!.id,
      status: 'active'
    });
    setIsAddOrgOpen(false);
    loadDatabase();
  };

  const handleAddProviderSubmit = async (entityData: any, providerData: any) => {
    const result = await db.createProvider(entityData, providerData);
    await db.createRelationship({
      from_entity_id: result.entity_id,
      to_entity_id: event!.entity_id,
      relationship_type: 'official_photographer_of', // default photographer
      context_event_id: event!.id,
      status: 'active'
    });
    setIsAddProviderOpen(false);
    loadDatabase();
  };

  const handleIssueCredentialSubmit = async (credentialData: any) => {
    await db.createCredential(credentialData);
    setIsIssueCredOpen(false);
    loadDatabase();
  };

  const handleRevokeCredential = async (id: string) => {
    if (confirm('¿Estás seguro de que quieres revocar esta credencial? Esta acción se reflejará en la blockchain.')) {
      await db.updateCredential(id, { status: 'revoked', revoked_at: new Date().toISOString() });
      loadDatabase();
    }
  };

  const handleOpenStellarEntity = (entity: Entity) => {
    setSelectedStellarEntity(entity);
    setSelectedStellarCredential(null);
    setIsStellarModalOpen(true);
  };

  const handleOpenStellarCredential = (cred: Credential) => {
    setSelectedStellarCredential(cred);
    setSelectedStellarEntity(null);
    setIsStellarModalOpen(true);
  };

  const handleBulkRegisterStellar = async () => {
    if (confirm(`¿Deseas registrar en bloque las ${pendingRegistrations.length} acreditaciones pendientes en Stellar?`)) {
      setIsLoading(true);
      for (const item of pendingRegistrations) {
        try {
          const hashData = item.type === 'entity'
            ? { 
                id: (item.raw as Entity).id, 
                name: (item.raw as Entity).display_name, 
                type: (item.raw as Entity).type, 
                city: (item.raw as Entity).city 
              }
            : { 
                id: (item.raw as Credential).id, 
                code: (item.raw as Credential).credential_code, 
                title: (item.raw as Credential).title 
              };
          const computedHash = await generateMetadataHash(hashData);

          if (item.type === 'entity') {
            const rawEntity = item.raw as Entity;
            await db.updateEntity(rawEntity.id, { stellar_status: 'pending', metadata_hash: computedHash });
            const res = await registerEntityOnChain({ ...rawEntity, metadata_hash: computedHash });
            await db.updateEntity(rawEntity.id, { stellar_status: 'registered', stellar_tx: res.txHash });
          } else {
            const rawCred = item.raw as Credential;
            await db.updateCredential(rawCred.id, { stellar_status: 'pending', metadata_hash: computedHash });
            const res = await issueCredentialOnChain({ ...rawCred, metadata_hash: computedHash });
            await db.updateCredential(rawCred.id, { stellar_status: 'registered', stellar_tx: res.txHash });
          }
        } catch (e) {
          console.error(e);
        }
      }
      setIsLoading(false);
      loadDatabase();
    }
  };

  const tabItems = [
    { id: 'summary', label: 'Resumen' },
    { id: 'schools', label: 'Escuelas', count: eventSchools.length },
    { id: 'dancers', label: 'Bailarinas', count: eventDancers.length },
    { id: 'teachers', label: 'Profesoras', count: eventTeachers.length },
    { id: 'providers', label: 'Proveedores', count: eventProviders.length },
    { id: 'credentials', label: 'Credenciales', count: currentEventCredentials.length },
    { id: 'pending', label: 'Pendientes', count: pendingRegistrations.length },
    { id: 'qr', label: 'QR Entrada' },
  ];

  if (isLoading && !event) {
    return <div className="text-stone-400 py-12 text-center">Cargando panel de evento...</div>;
  }

  if (!event) {
    return (
      <div className="text-center py-20 text-stone-500">
        El evento no existe o no tiene relación con el sistema actual.
      </div>
    );
  }

  const publicEventUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/evento/${event.slug}`
    : `https://culturago.stellar.app/evento/${event.slug}`;

  return (
    <div className="space-y-6 text-left">
      {/* Event Header Widget */}
      <div className="bg-[#FCFBF7] border border-stone-200/80 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-[#5C061E] bg-[#5C061E]/5 px-2 py-0.5 rounded">
            Panel Principal del Evento
          </div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#1C1A17] leading-none">
            {event.name}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-xs text-stone-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Septiembre 2026
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {event.location}
            </span>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex flex-wrap gap-2.5 w-full md:w-auto">
          <Button variant="secondary" size="sm" onClick={() => handleCopyLink(`/evento/${event.slug}`, event.id)}>
            {copiedId === event.id ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                Enlace Copiado
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1" />
                Copiar Link Público
              </>
            )}
          </Button>

          <a href={`/evento/${event.slug}`} target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm">
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
              Ver Vista Pública
            </Button>
          </a>

          <Button variant="primary" size="sm" onClick={() => setIsIssueCredOpen(true)}>
            <Award className="w-3.5 h-3.5 mr-1" />
            Emitir Credencial
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={tabItems}
        activeTab={activeTab}
        onChange={(tabId) => {
          setActiveTab(tabId);
          setSearchTerm(''); // Clear search on tab switch
        }}
      />

      {/* Search Input (Except Summary, QR tabs) */}
      {activeTab !== 'summary' && activeTab !== 'qr' && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
              className="w-full pl-9 pr-4 py-2 border border-stone-200 rounded-lg outline-none text-xs focus:border-[#5C061E]"
            />
          </div>

          <div className="flex gap-2 w-full sm:w-auto justify-end">
            {activeTab === 'schools' && (
              <Button variant="secondary" size="sm" onClick={() => setIsAddOrgOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Crear Escuela
              </Button>
            )}
            {activeTab === 'dancers' && (
              <Button variant="secondary" size="sm" onClick={() => setIsAddPersonOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Crear Bailarina
              </Button>
            )}
            {activeTab === 'teachers' && (
              <Button variant="secondary" size="sm" onClick={() => setIsAddPersonOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Crear Profesora
              </Button>
            )}
            {activeTab === 'providers' && (
              <Button variant="secondary" size="sm" onClick={() => setIsAddProviderOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Crear Proveedor
              </Button>
            )}
            {activeTab === 'pending' && pendingRegistrations.length > 0 && (
              <Button variant="primary" size="sm" onClick={handleBulkRegisterStellar}>
                <Cpu className="w-3.5 h-3.5 mr-1" /> Registrar todo en Stellar
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Tab Panels */}
      {activeTab === 'summary' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs text-left">
              <h3 className="font-serif text-lg font-bold text-stone-850 border-b border-stone-100 pb-2 mb-3">
                Descripción del Encuentro
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                {event.description}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-4 text-xs">
                <div className="bg-stone-50 p-3 rounded-lg border border-stone-200/50">
                  <span className="text-stone-400 font-semibold block mb-0.5">Sede Oficial:</span>
                  <span className="font-semibold text-stone-700">{event.location}</span>
                </div>
                <div className="bg-stone-50 p-3 rounded-lg border border-stone-200/50">
                  <span className="text-stone-400 font-semibold block mb-0.5">Organiza:</span>
                  <span className="font-semibold text-stone-700">{organizer?.name || 'FDVC'}</span>
                </div>
              </div>
            </div>

            {/* Quick stats details */}
            <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs text-left">
              <h3 className="font-serif text-lg font-bold text-stone-850 border-b border-stone-100 pb-2 mb-4">
                Integración de Cuentas Stellar
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 bg-emerald-50/20 border border-emerald-100 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-stone-500 font-semibold block">Registrados en Red:</span>
                    <span className="text-lg font-bold text-emerald-800 mt-1 block">
                      {entities.filter(e => e.stellar_status === 'registered').length + credentials.filter(c => c.stellar_status === 'registered').length}
                    </span>
                  </div>
                  <Cpu className="w-8 h-8 text-emerald-600/20" />
                </div>
                <div className="p-4 bg-amber-50/20 border border-amber-100 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-stone-500 font-semibold block">Pendientes de Registro:</span>
                    <span className="text-lg font-bold text-amber-800 mt-1 block">
                      {entities.filter(e => e.stellar_status !== 'registered').length + credentials.filter(c => c.stellar_status !== 'registered').length}
                    </span>
                  </div>
                  <Clock className="w-8 h-8 text-amber-600/20" />
                </div>
              </div>
            </div>
          </div>

          {/* Right sidebar info */}
          <div className="space-y-6">
            <div className="bg-[#FCFBF7] border border-[#C5A880]/30 rounded-xl p-5 text-left">
              <h4 className="text-xs uppercase font-bold text-[#5C061E] tracking-wider mb-2">Acreditación Rápida</h4>
              <p className="text-[11px] text-stone-500 leading-relaxed mb-4">
                Usa estos atajos para agregar de forma ágil bailarinas solistas, escuelas de danza asociadas o proveedores comerciales.
              </p>
              <div className="flex flex-col gap-2">
                <Button variant="secondary" size="sm" className="w-full text-xs font-semibold justify-start" onClick={() => setIsAddPersonOpen(true)}>
                  <Plus className="w-4 h-4 mr-2 text-[#C5A880]" />
                  Añadir Bailarina / Maestra
                </Button>
                <Button variant="secondary" size="sm" className="w-full text-xs font-semibold justify-start" onClick={() => setIsAddOrgOpen(true)}>
                  <Plus className="w-4 h-4 mr-2 text-[#C5A880]" />
                  Añadir Escuela / Compañía
                </Button>
                <Button variant="secondary" size="sm" className="w-full text-xs font-semibold justify-start" onClick={() => setIsAddProviderOpen(true)}>
                  <Plus className="w-4 h-4 mr-2 text-[#C5A880]" />
                  Añadir Proveedor Técnico
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schools Tab */}
      {activeTab === 'schools' && (
        <Table
          columns={[
            {
              header: 'Escuela / Organización',
              accessor: (row) => (
                <div className="text-left font-semibold text-stone-800">
                  {row.entity.display_name}
                </div>
              ),
            },
            {
              header: 'Ciudad / País',
              accessor: (row) => `${row.entity.city}, ${row.entity.country}`,
            },
            {
              header: 'Contacto Directo',
              accessor: (row) => (
                <div className="flex flex-col text-left text-xs">
                  <span>{row.org?.contact_name || '-'}</span>
                  <span className="text-stone-400">{row.org?.contact_email || '-'}</span>
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
                  <Button variant="secondary" size="sm" className="text-xs" onClick={() => handleOpenStellarEntity(row.entity)}>
                    <Cpu className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="secondary" size="sm" className="text-xs" onClick={() => handleCopyLink(`/o/${row.entity.slug}`, row.entity.id)}>
                    {copiedId === row.entity.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                  <a href={`/o/${row.entity.slug}`} target="_blank" rel="noreferrer">
                    <Button variant="secondary" size="sm" className="text-xs">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </a>
                </div>
              ),
              className: 'w-40 text-right',
            },
          ]}
          data={eventSchools}
        />
      )}

      {/* Dancers Tab */}
      {activeTab === 'dancers' && (
        <Table
          columns={[
            {
              header: 'Nombre Artístico',
              accessor: (row) => (
                <div className="text-left font-semibold text-stone-800">
                  {row.person.artistic_name}
                </div>
              ),
            },
            {
              header: 'Instagram',
              accessor: (row) => row.person.instagram || '-',
            },
            {
              header: 'Rol',
              accessor: (row) => 'Bailarina',
            },
            {
              header: 'Stellar Status',
              accessor: (row) => <StellarStatusBadge status={row.entity.stellar_status} />,
            },
            {
              header: 'Acciones',
              accessor: (row) => (
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" size="sm" className="text-xs" onClick={() => handleOpenStellarEntity(row.entity)}>
                    <Cpu className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="secondary" size="sm" className="text-xs" onClick={() => handleCopyLink(`/p/${row.entity.slug}`, row.entity.id)}>
                    {copiedId === row.entity.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                  <a href={`/p/${row.entity.slug}`} target="_blank" rel="noreferrer">
                    <Button variant="secondary" size="sm" className="text-xs">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </a>
                </div>
              ),
              className: 'w-40 text-right',
            },
          ]}
          data={eventDancers}
        />
      )}

      {/* Teachers Tab */}
      {activeTab === 'teachers' && (
        <Table
          columns={[
            {
              header: 'Nombre Artístico',
              accessor: (row) => (
                <div className="text-left font-semibold text-stone-800">
                  {row.person.artistic_name}
                </div>
              ),
            },
            {
              header: 'Rol específico',
              accessor: (row) => (
                <span className="capitalize">{row.person.main_role === 'teacher' ? 'Profesora' : 'Directora'}</span>
              ),
            },
            {
              header: 'Ciudad',
              accessor: (row) => row.entity.city,
            },
            {
              header: 'Stellar Status',
              accessor: (row) => <StellarStatusBadge status={row.entity.stellar_status} />,
            },
            {
              header: 'Acciones',
              accessor: (row) => (
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" size="sm" className="text-xs" onClick={() => handleOpenStellarEntity(row.entity)}>
                    <Cpu className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="secondary" size="sm" className="text-xs" onClick={() => handleCopyLink(`/p/${row.entity.slug}`, row.entity.id)}>
                    {copiedId === row.entity.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                  <a href={`/p/${row.entity.slug}`} target="_blank" rel="noreferrer">
                    <Button variant="secondary" size="sm" className="text-xs">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </a>
                </div>
              ),
              className: 'w-40 text-right',
            },
          ]}
          data={eventTeachers}
        />
      )}

      {/* Providers Tab */}
      {activeTab === 'providers' && (
        <Table
          columns={[
            {
              header: 'Proveedor Comercial',
              accessor: (row) => (
                <div className="text-left font-semibold text-stone-800">
                  {row.entity.display_name}
                </div>
              ),
            },
            {
              header: 'Tipo de Servicio',
              accessor: (row) => (
                <span className="text-xs bg-stone-100 border border-stone-200 px-2 py-0.5 rounded text-stone-600">
                  {row.provider.provider_type === 'photographer' ? 'Fotógrafo' 
                   : row.provider.provider_type === 'videographer' ? 'Filmación'
                   : row.provider.provider_type === 'venue' ? 'Teatro'
                   : row.provider.provider_type === 'sponsor' ? 'Auspiciador'
                   : 'Proveedor'}
                </span>
              ),
            },
            {
              header: 'Contacto',
              accessor: (row) => row.provider.email || row.provider.phone || '-',
            },
            {
              header: 'Stellar Status',
              accessor: (row) => <StellarStatusBadge status={row.entity.stellar_status} />,
            },
            {
              header: 'Acciones',
              accessor: (row) => (
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" size="sm" className="text-xs" onClick={() => handleOpenStellarEntity(row.entity)}>
                    <Cpu className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="secondary" size="sm" className="text-xs" onClick={() => handleCopyLink(`/proveedor/${row.entity.slug}`, row.entity.id)}>
                    {copiedId === row.entity.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                  <a href={`/proveedor/${row.entity.slug}`} target="_blank" rel="noreferrer">
                    <Button variant="secondary" size="sm" className="text-xs">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </a>
                </div>
              ),
              className: 'w-40 text-right',
            },
          ]}
          data={eventProviders}
        />
      )}

      {/* Credentials Tab */}
      {activeTab === 'credentials' && (
        <Table
          columns={[
            {
              header: 'Código',
              accessor: (row) => <span className="font-mono text-xs font-bold text-stone-700">{row.credential_code}</span>,
            },
            {
              header: 'Título Credencial',
              accessor: (row) => <div className="text-left font-semibold text-stone-850">{row.title}</div>,
            },
            {
              header: 'Sujeto / Recipiente',
              accessor: (row) => row.subjectEntity?.display_name || 'Desconocido',
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
                  <Button variant="secondary" size="sm" className="text-xs" onClick={() => handleOpenStellarCredential(row)}>
                    <Cpu className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="secondary" size="sm" className="text-xs" onClick={() => handleCopyLink(`/credencial/${row.credential_code}`, row.id)}>
                    {copiedId === row.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                  <a href={`/credencial/${row.credential_code}`} target="_blank" rel="noreferrer">
                    <Button variant="secondary" size="sm" className="text-xs">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </a>
                  {row.status === 'issued' && (
                    <Button variant="danger" size="sm" className="text-xs" onClick={() => handleRevokeCredential(row.id)}>
                      Revocar
                    </Button>
                  )}
                </div>
              ),
              className: 'w-48 text-right',
            },
          ]}
          data={currentEventCredentials}
        />
      )}

      {/* Pending Stellar Registrations Tab */}
      {activeTab === 'pending' && (
        <Table
          columns={[
            {
              header: 'Identidad / Registro',
              accessor: (row) => (
                <div className="text-left">
                  <span className="font-semibold text-stone-850 block">{row.name}</span>
                  <span className="text-[10px] text-stone-400 capitalize">{row.entityType}</span>
                </div>
              ),
            },
            {
              header: 'Tipo de Registro',
              accessor: (row) => (
                <span className="capitalize text-xs font-semibold text-stone-600">
                  {row.type === 'entity' ? 'Entidad' : 'Credencial'}
                </span>
              ),
            },
            {
              header: 'Stellar Status',
              accessor: (row) => <StellarStatusBadge status={row.status as StellarStatus} />,
            },
            {
              header: 'Acción',
              accessor: (row) => (
                <div className="flex justify-end">
                  <Button 
                    variant="primary" 
                    size="sm" 
                    className="text-xs font-semibold"
                    onClick={() => row.type === 'entity' ? handleOpenStellarEntity(row.raw as Entity) : handleOpenStellarCredential(row.raw as Credential)}
                  >
                    <Cpu className="w-3.5 h-3.5 mr-1" />
                    Registrar en Stellar
                  </Button>
                </div>
              ),
              className: 'w-48 text-right',
            },
          ]}
          data={pendingRegistrations}
          emptyMessage="No hay registros pendientes de anclar en Stellar."
        />
      )}

      {/* QR Tab */}
      {activeTab === 'qr' && (
        <div className="max-w-md mx-auto text-center py-6 space-y-6">
          <div className="p-4 bg-white border border-stone-200 rounded-2xl shadow-xs">
            <h3 className="font-serif text-lg font-bold text-stone-800 mb-2">QR del Festival FDVC 2026</h3>
            <p className="text-xs text-stone-400 mb-6">
              Este QR apunta directamente a la cartelera pública del evento. Úsalo en afiches, folletos o accesos de prensa.
            </p>
            <QRCodeBlock
              value={publicEventUrl}
              label={publicEventUrl}
            />
          </div>
        </div>
      )}

      {/* ==========================================
          MODALS / FORMS POPUPS
          ========================================== */}

      {/* Add Person Modal */}
      <Dialog 
        isOpen={isAddPersonOpen} 
        onClose={() => setIsAddPersonOpen(false)} 
        title="Crear Nueva Bailarina o Profesora"
        size="lg"
      >
        <PersonForm 
          onSubmit={handleAddPersonSubmit} 
          onCancel={() => setIsAddPersonOpen(false)} 
        />
      </Dialog>

      {/* Add Org Modal */}
      <Dialog
        isOpen={isAddOrgOpen}
        onClose={() => setIsAddOrgOpen(false)}
        title="Crear Nueva Organización / Escuela"
        size="lg"
      >
        <OrganizationForm
          onSubmit={handleAddOrgSubmit}
          onCancel={() => setIsAddOrgOpen(false)}
        />
      </Dialog>

      {/* Add Provider Modal */}
      <Dialog
        isOpen={isAddProviderOpen}
        onClose={() => setIsAddProviderOpen(false)}
        title="Crear Nuevo Proveedor Técnico"
        size="lg"
      >
        <ProviderForm
          onSubmit={handleAddProviderSubmit}
          onCancel={() => setIsAddProviderOpen(false)}
        />
      </Dialog>

      {/* Issue Credential Modal */}
      <Dialog
        isOpen={isIssueCredOpen}
        onClose={() => setIsIssueCredOpen(false)}
        title="Emitir Credencial Verificable"
        size="lg"
      >
        <CredentialForm
          entities={entities}
          onSubmit={handleIssueCredentialSubmit}
          onCancel={() => setIsIssueCredOpen(false)}
        />
      </Dialog>

      {/* Stellar Status Technical Dialog */}
      <Dialog
        isOpen={isStellarModalOpen}
        onClose={() => setIsStellarModalOpen(false)}
        title="Detalles y Acciones de Registro Stellar"
        size="md"
      >
        <StellarStatusBlock
          entity={selectedStellarEntity}
          credential={selectedStellarCredential}
          onUpdate={() => {
            loadDatabase();
          }}
        />
      </Dialog>

    </div>
  );
}
