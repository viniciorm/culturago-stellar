import { createClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type EntityType = 'person' | 'organization' | 'provider' | 'event';
export type EntityStatus = 'draft' | 'pending' | 'verified' | 'archived';
export type StellarStatus = 'not_registered' | 'pending' | 'registered' | 'failed';
export type WalletStatus = 'none' | 'reserved' | 'claimed';
export type WalletType = 'none' | 'stellar_classic' | 'smart_wallet' | 'passkey';
export type RelationshipStatus = 'pending' | 'active' | 'ended' | 'rejected' | 'archived';

export interface Entity {
  id: string;
  type: EntityType;
  display_name: string;
  slug: string;
  country: string;
  city: string;
  status: EntityStatus;
  metadata_hash?: string | null;
  stellar_status: StellarStatus;
  stellar_tx?: string | null;
  wallet_address?: string | null;
  wallet_status: WalletStatus;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface Person {
  id: string;
  entity_id: string;
  legal_name?: string | null;
  artistic_name: string;
  email?: string | null;
  phone?: string | null;
  instagram?: string | null;
  bio?: string | null;
  photo_url?: string | null;
  main_role: 'dancer' | 'teacher' | 'director' | 'judge' | 'guest' | 'staff' | 'other';
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  entity_id: string;
  name: string;
  organization_type: 'festival' | 'school' | 'academy' | 'company' | 'association' | 'producer' | 'community' | 'other';
  website?: string | null;
  instagram?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Provider {
  id: string;
  entity_id: string;
  name: string;
  provider_type: 'venue' | 'pub' | 'photographer' | 'videographer' | 'foodtruck' | 'sound' | 'lighting' | 'sponsor' | 'streaming' | 'security' | 'makeup' | 'costume' | 'ticketing' | 'transport' | 'other';
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  instagram?: string | null;
  website?: string | null;
  public_description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  entity_id: string;
  name: string;
  slug: string;
  year: number;
  start_date: string;
  end_date?: string | null;
  location?: string | null;
  address?: string | null;
  description?: string | null;
  organizer_entity_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Relationship {
  id: string;
  from_entity_id: string;
  to_entity_id: string;
  relationship_type:
    | 'organizer_of'
    | 'participant_of'
    | 'member_of'
    | 'teacher_at'
    | 'director_of'
    | 'founder_of'
    | 'provider_of'
    | 'venue_of'
    | 'sponsor_of'
    | 'official_photographer_of'
    | 'official_videographer_of'
    | 'technical_partner_of'
    | 'food_partner_of'
    | 'media_partner_of';
  context_event_id?: string | null;
  status: RelationshipStatus;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Credential {
  id: string;
  credential_code: string;
  issuer_entity_id: string;
  subject_entity_id: string;
  event_id?: string | null;
  credential_type: string;
  title: string;
  description?: string | null;
  status: 'draft' | 'issued' | 'revoked';
  metadata_hash?: string | null;
  stellar_status: StellarStatus;
  stellar_tx?: string | null;
  issued_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StellarTransaction {
  id: string;
  entity_id?: string | null;
  credential_id?: string | null;
  tx_hash: string;
  operation_type: 'register_entity' | 'issue_credential' | 'revoke_credential' | 'link_wallet';
  status: 'pending' | 'success' | 'failed';
  error_message?: string | null;
  created_at: string;
}

export interface Wallet {
  id: string;
  entity_id: string;
  wallet_address?: string | null;
  wallet_type: WalletType;
  wallet_status: 'none' | 'reserved' | 'claimed' | 'disabled';
  claimed_at?: string | null;
  created_at: string;
  updated_at: string;
}

// Complete Populated types for easier UI usage
export type PopulatedRelationship = Relationship & {
  fromEntity: Entity;
  toEntity: Entity;
};

export type PopulatedCredential = Credential & {
  issuerEntity: Entity;
  subjectEntity: Entity;
  event?: Event | null;
};

// ============================================================================
// DUAL-MODE ENGINE INITIALIZATION
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

console.log(
  `[CulturaGO DB] Inicializando en modo: ${
    isSupabaseConfigured ? 'SUPABASE REAL' : 'MOCK LOCAL (LocalStorage/Memoria)'
  }`
);

// ============================================================================
// SEED DATA FOR MOCK ENGINE
// ============================================================================

const SEED_ENTITIES: Entity[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    type: 'organization',
    display_name: 'Festival Nacional Danza del Vientre Chile',
    slug: 'fdvc',
    country: 'Chile',
    city: 'Santiago',
    status: 'verified',
    stellar_status: 'registered',
    stellar_tx: 'tx_organizer_init_stellar_hash_00000000000000000000000000000',
    wallet_address: 'GBFDVCORGANIZERKEYXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    wallet_status: 'claimed',
    is_public: true,
    created_at: new Date('2026-01-10T12:00:00Z').toISOString(),
    updated_at: new Date('2026-01-10T12:00:00Z').toISOString(),
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    type: 'event',
    display_name: 'Festival Nacional Danza del Vientre Chile 2026',
    slug: 'fdvc-2026',
    country: 'Chile',
    city: 'Santiago',
    status: 'verified',
    stellar_status: 'registered',
    stellar_tx: 'tx_event_init_stellar_hash_0000000000000000000000000000000000',
    wallet_status: 'none',
    is_public: true,
    created_at: new Date('2026-01-15T14:30:00Z').toISOString(),
    updated_at: new Date('2026-01-15T14:30:00Z').toISOString(),
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    type: 'organization',
    display_name: 'Escuela Demo Danza Árabe',
    slug: 'escuela-demo',
    country: 'Chile',
    city: 'Santiago',
    status: 'verified',
    stellar_status: 'not_registered',
    wallet_status: 'none',
    is_public: true,
    created_at: new Date('2026-02-01T10:00:00Z').toISOString(),
    updated_at: new Date('2026-02-01T10:00:00Z').toISOString(),
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    type: 'person',
    display_name: 'Bailarina Demo',
    slug: 'bailarina-demo',
    country: 'Chile',
    city: 'Santiago',
    status: 'verified',
    stellar_status: 'pending',
    stellar_tx: 'tx_bailarina_pending_hash_11111111111111111111111111111111',
    wallet_address: 'GBAILARINADEMOXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    wallet_status: 'reserved',
    is_public: true,
    created_at: new Date('2026-02-15T09:15:00Z').toISOString(),
    updated_at: new Date('2026-02-15T09:15:00Z').toISOString(),
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    type: 'person',
    display_name: 'Profesora Demo',
    slug: 'profesora-demo',
    country: 'Chile',
    city: 'Valparaíso',
    status: 'verified',
    stellar_status: 'registered',
    stellar_tx: 'tx_profesora_registered_hash_222222222222222222222222222222',
    wallet_address: 'GBPROFESORADEMOXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    wallet_status: 'reserved',
    is_public: true,
    created_at: new Date('2026-02-20T11:45:00Z').toISOString(),
    updated_at: new Date('2026-02-20T11:45:00Z').toISOString(),
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    type: 'provider',
    display_name: 'Fotografía Cultural Demo',
    slug: 'fotografia-demo',
    country: 'Chile',
    city: 'Santiago',
    status: 'verified',
    stellar_status: 'registered',
    stellar_tx: 'tx_photographer_registered_hash_3333333333333333333333333',
    wallet_address: 'GBFOTOGRAFIADEMOXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    wallet_status: 'claimed',
    is_public: true,
    created_at: new Date('2026-03-01T15:00:00Z').toISOString(),
    updated_at: new Date('2026-03-01T15:00:00Z').toISOString(),
  },
];

const SEED_ORGANIZATIONS: Organization[] = [
  {
    id: 'org-fdvc-id',
    entity_id: '11111111-1111-1111-1111-111111111111',
    name: 'Festival Nacional Danza del Vientre Chile',
    organization_type: 'festival',
    instagram: '@fdvc_chile',
    contact_name: 'Directora FDVC',
    contact_email: 'contacto@fdvc.cl',
    created_at: new Date('2026-01-10T12:00:00Z').toISOString(),
    updated_at: new Date('2026-01-10T12:00:00Z').toISOString(),
  },
  {
    id: 'org-school-demo-id',
    entity_id: '33333333-3333-3333-3333-333333333333',
    name: 'Escuela Demo Danza Árabe',
    organization_type: 'school',
    instagram: '@escuela_demo_danza',
    contact_name: 'Directora Demo',
    contact_email: 'escuelademo@gmail.com',
    created_at: new Date('2026-02-01T10:00:00Z').toISOString(),
    updated_at: new Date('2026-02-01T10:00:00Z').toISOString(),
  },
];

const SEED_PEOPLE: Person[] = [
  {
    id: 'p-dancer-demo-id',
    entity_id: '44444444-4444-4444-4444-444444444444',
    legal_name: 'María José Bailarina',
    artistic_name: 'Bailarina Demo',
    email: 'bailarinademo@gmail.com',
    phone: '+56912345678',
    instagram: '@bailarina_demo',
    bio: 'Bailarina solista e intérprete de danzas árabes, apasionada por la música folclórica del Medio Oriente.',
    main_role: 'dancer',
    created_at: new Date('2026-02-15T09:15:00Z').toISOString(),
    updated_at: new Date('2026-02-15T09:15:00Z').toISOString(),
  },
  {
    id: 'p-teacher-demo-id',
    entity_id: '55555555-5555-5555-5555-555555555555',
    legal_name: 'Camila Paz Profesora',
    artistic_name: 'Profesora Demo',
    email: 'profesorademo@gmail.com',
    phone: '+56987654321',
    instagram: '@profesora_demo',
    bio: 'Maestra y coreógrafa de danza oriental con más de 12 años de trayectoria. Directora de la Escuela Demo.',
    main_role: 'teacher',
    created_at: new Date('2026-02-20T11:45:00Z').toISOString(),
    updated_at: new Date('2026-02-20T11:45:00Z').toISOString(),
  },
];

const SEED_PROVIDERS: Provider[] = [
  {
    id: 'prov-photographer-id',
    entity_id: '66666666-6666-6666-6666-666666666666',
    name: 'Fotografía Cultural Demo',
    provider_type: 'photographer',
    contact_name: 'Juan Foto',
    email: 'juanfoto@gmail.com',
    phone: '+56944445555',
    instagram: '@fotografia_cultural_demo',
    public_description: 'Especializados en fotografía escénica, capturando la esencia del arte y el movimiento en el escenario.',
    created_at: new Date('2026-03-01T15:00:00Z').toISOString(),
    updated_at: new Date('2026-03-01T15:00:00Z').toISOString(),
  },
];

const SEED_EVENTS: Event[] = [
  {
    id: '22222222-2222-2222-2222-333333333333',
    entity_id: '22222222-2222-2222-2222-222222222222',
    name: 'FDVC 2026',
    slug: 'fdvc-2026',
    year: 2026,
    start_date: '2026-09-05',
    end_date: '2026-09-07',
    location: 'Aula Magna Manuel de Salas',
    address: 'Irarrázaval 3780, Ñuñoa, Santiago',
    description: 'El encuentro nacional de danza oriental más importante de Chile, reuniendo a escuelas, maestras, bailarinas y proveedores de todo el país.',
    organizer_entity_id: '11111111-1111-1111-1111-111111111111',
    created_at: new Date('2026-01-15T14:30:00Z').toISOString(),
    updated_at: new Date('2026-01-15T14:30:00Z').toISOString(),
  },
];

const SEED_RELATIONSHIPS: Relationship[] = [
  {
    id: 'rel-1',
    from_entity_id: '11111111-1111-1111-1111-111111111111',
    to_entity_id: '22222222-2222-2222-2222-222222222222',
    relationship_type: 'organizer_of',
    context_event_id: '22222222-2222-2222-2222-333333333333',
    status: 'active',
    created_at: new Date('2026-01-15T14:35:00Z').toISOString(),
    updated_at: new Date('2026-01-15T14:35:00Z').toISOString(),
  },
  {
    id: 'rel-2',
    from_entity_id: '33333333-3333-3333-3333-333333333333',
    to_entity_id: '22222222-2222-2222-2222-222222222222',
    relationship_type: 'participant_of',
    context_event_id: '22222222-2222-2222-2222-333333333333',
    status: 'active',
    created_at: new Date('2026-02-01T10:10:00Z').toISOString(),
    updated_at: new Date('2026-02-01T10:10:00Z').toISOString(),
  },
  {
    id: 'rel-3',
    from_entity_id: '44444444-4444-4444-4444-444444444444',
    to_entity_id: '33333333-3333-3333-3333-333333333333',
    relationship_type: 'member_of',
    context_event_id: '22222222-2222-2222-2222-333333333333',
    status: 'active',
    created_at: new Date('2026-02-15T09:20:00Z').toISOString(),
    updated_at: new Date('2026-02-15T09:20:00Z').toISOString(),
  },
  {
    id: 'rel-4',
    from_entity_id: '44444444-4444-4444-4444-444444444444',
    to_entity_id: '22222222-2222-2222-2222-222222222222',
    relationship_type: 'participant_of',
    context_event_id: '22222222-2222-2222-2222-333333333333',
    status: 'active',
    created_at: new Date('2026-02-15T09:25:00Z').toISOString(),
    updated_at: new Date('2026-02-15T09:25:00Z').toISOString(),
  },
  {
    id: 'rel-5',
    from_entity_id: '55555555-5555-5555-5555-555555555555',
    to_entity_id: '33333333-3333-3333-3333-333333333333',
    relationship_type: 'teacher_at',
    context_event_id: '22222222-2222-2222-2222-333333333333',
    status: 'active',
    created_at: new Date('2026-02-20T11:50:00Z').toISOString(),
    updated_at: new Date('2026-02-20T11:50:00Z').toISOString(),
  },
  {
    id: 'rel-6',
    from_entity_id: '55555555-5555-5555-5555-555555555555',
    to_entity_id: '33333333-3333-3333-3333-333333333333',
    relationship_type: 'director_of',
    context_event_id: '22222222-2222-2222-2222-333333333333',
    status: 'active',
    created_at: new Date('2026-02-20T11:50:00Z').toISOString(),
    updated_at: new Date('2026-02-20T11:50:00Z').toISOString(),
  },
  {
    id: 'rel-7',
    from_entity_id: '55555555-5555-5555-5555-555555555555',
    to_entity_id: '22222222-2222-2222-2222-222222222222',
    relationship_type: 'participant_of',
    context_event_id: '22222222-2222-2222-2222-333333333333',
    status: 'active',
    created_at: new Date('2026-02-20T11:55:00Z').toISOString(),
    updated_at: new Date('2026-02-20T11:55:00Z').toISOString(),
  },
  {
    id: 'rel-8',
    from_entity_id: '66666666-6666-6666-6666-666666666666',
    to_entity_id: '22222222-2222-2222-2222-222222222222',
    relationship_type: 'official_photographer_of',
    context_event_id: '22222222-2222-2222-2222-333333333333',
    status: 'active',
    created_at: new Date('2026-03-01T15:05:00Z').toISOString(),
    updated_at: new Date('2026-03-01T15:05:00Z').toISOString(),
  },
];

const SEED_CREDENTIALS: Credential[] = [
  {
    id: 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    credential_code: 'CRED-FDVC26-SCH-DEMO',
    issuer_entity_id: '11111111-1111-1111-1111-111111111111',
    subject_entity_id: '33333333-3333-3333-3333-333333333333',
    event_id: '22222222-2222-2222-2222-333333333333',
    credential_type: 'school_participant',
    title: 'Escuela Participante FDVC 2026',
    description: 'Acreditación oficial que certifica la participación de la escuela en las galas del Festival Nacional Danza del Vientre Chile 2026.',
    status: 'issued',
    stellar_status: 'not_registered',
    issued_at: new Date('2026-03-10T12:00:00Z').toISOString(),
    created_at: new Date('2026-03-10T12:00:00Z').toISOString(),
    updated_at: new Date('2026-03-10T12:00:00Z').toISOString(),
  },
  {
    id: 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
    credential_code: 'CRED-FDVC26-DCR-DEMO',
    issuer_entity_id: '11111111-1111-1111-1111-111111111111',
    subject_entity_id: '44444444-4444-4444-4444-444444444444',
    event_id: '22222222-2222-2222-2222-333333333333',
    credential_type: 'dancer_participant',
    title: 'Bailarina Participante FDVC 2026',
    description: 'Acreditación oficial que certifica la participación de la bailarina solista en las muestras artísticas de FDVC 2026.',
    status: 'issued',
    stellar_status: 'not_registered',
    issued_at: new Date('2026-03-12T14:00:00Z').toISOString(),
    created_at: new Date('2026-03-12T14:00:00Z').toISOString(),
    updated_at: new Date('2026-03-12T14:00:00Z').toISOString(),
  },
  {
    id: 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
    credential_code: 'CRED-FDVC26-TCH-DEMO',
    issuer_entity_id: '11111111-1111-1111-1111-111111111111',
    subject_entity_id: '55555555-5555-5555-5555-555555555555',
    event_id: '22222222-2222-2222-2222-333333333333',
    credential_type: 'teacher_director',
    title: 'Profesora / Directora FDVC 2026',
    description: 'Acreditación oficial de la labor docente y dirección artística de Escuela Demo Danza Árabe en el marco de FDVC 2026.',
    status: 'issued',
    stellar_status: 'not_registered',
    issued_at: new Date('2026-03-15T10:30:00Z').toISOString(),
    created_at: new Date('2026-03-15T10:30:00Z').toISOString(),
    updated_at: new Date('2026-03-15T10:30:00Z').toISOString(),
  },
  {
    id: 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
    credential_code: 'CRED-FDVC26-PHO-DEMO',
    issuer_entity_id: '11111111-1111-1111-1111-111111111111',
    subject_entity_id: '66666666-6666-6666-6666-666666666666',
    event_id: '22222222-2222-2222-2222-333333333333',
    credential_type: 'official_photographer',
    title: 'Fotógrafo Oficial FDVC 2026',
    description: 'Acreditación de prensa y cobertura fotográfica autorizada para capturar las presentaciones del festival en el Aula Magna Manuel de Salas.',
    status: 'issued',
    stellar_status: 'not_registered',
    issued_at: new Date('2026-03-20T16:00:00Z').toISOString(),
    created_at: new Date('2026-03-20T16:00:00Z').toISOString(),
    updated_at: new Date('2026-03-20T16:00:00Z').toISOString(),
  },
];

const SEED_WALLETS: Wallet[] = [
  {
    id: 'w-1',
    entity_id: '11111111-1111-1111-1111-111111111111',
    wallet_address: 'GBFDVCORGANIZERKEYXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    wallet_type: 'stellar_classic',
    wallet_status: 'claimed',
    claimed_at: new Date('2026-01-10T12:00:00Z').toISOString(),
    created_at: new Date('2026-01-10T12:00:00Z').toISOString(),
    updated_at: new Date('2026-01-10T12:00:00Z').toISOString(),
  },
  {
    id: 'w-2',
    entity_id: '44444444-4444-4444-4444-444444444444',
    wallet_address: 'GBAILARINADEMOXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    wallet_type: 'passkey',
    wallet_status: 'reserved',
    created_at: new Date('2026-02-15T09:15:00Z').toISOString(),
    updated_at: new Date('2026-02-15T09:15:00Z').toISOString(),
  },
  {
    id: 'w-3',
    entity_id: '55555555-5555-5555-5555-555555555555',
    wallet_address: 'GBPROFESORADEMOXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    wallet_type: 'passkey',
    wallet_status: 'reserved',
    created_at: new Date('2026-02-20T11:45:00Z').toISOString(),
    updated_at: new Date('2026-02-20T11:45:00Z').toISOString(),
  },
  {
    id: 'w-4',
    entity_id: '66666666-6666-6666-6666-666666666666',
    wallet_address: 'GBFOTOGRAFIADEMOXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    wallet_type: 'stellar_classic',
    wallet_status: 'claimed',
    claimed_at: new Date('2026-03-01T15:00:00Z').toISOString(),
    created_at: new Date('2026-03-01T15:00:00Z').toISOString(),
    updated_at: new Date('2026-03-01T15:00:00Z').toISOString(),
  },
];

// ============================================================================
// MOCK DATABASE CLIENT (LOCAL STORAGE & MEMORY PERSISTENCE)
// ============================================================================

class MockDatabase {
  private isBrowser = typeof window !== 'undefined';

  private getStore(key: string, defaultValue: any): any[] {
    if (!this.isBrowser) return defaultValue;
    const item = localStorage.getItem(`culturago_${key}`);
    if (!item) {
      localStorage.setItem(`culturago_${key}`, JSON.stringify(defaultValue));
      return defaultValue;
    }
    try {
      return JSON.parse(item);
    } catch {
      return defaultValue;
    }
  }

  private saveStore(key: string, data: any[]) {
    if (this.isBrowser) {
      localStorage.setItem(`culturago_${key}`, JSON.stringify(data));
    }
  }

  reset() {
    if (this.isBrowser) {
      localStorage.removeItem('culturago_entities');
      localStorage.removeItem('culturago_people');
      localStorage.removeItem('culturago_organizations');
      localStorage.removeItem('culturago_providers');
      localStorage.removeItem('culturago_events');
      localStorage.removeItem('culturago_relationships');
      localStorage.removeItem('culturago_credentials');
      localStorage.removeItem('culturago_wallets');
      localStorage.removeItem('culturago_stellar_transactions');
    }
  }

  get entities() { return this.getStore('entities', SEED_ENTITIES); }
  set entities(val) { this.saveStore('entities', val); }

  get people() { return this.getStore('people', SEED_PEOPLE); }
  set people(val) { this.saveStore('people', val); }

  get organizations() { return this.getStore('organizations', SEED_ORGANIZATIONS); }
  set organizations(val) { this.saveStore('organizations', val); }

  get providers() { return this.getStore('providers', SEED_PROVIDERS); }
  set providers(val) { this.saveStore('providers', val); }

  get events() { return this.getStore('events', SEED_EVENTS); }
  set events(val) { this.saveStore('events', val); }

  get relationships() { return this.getStore('relationships', SEED_RELATIONSHIPS); }
  set relationships(val) { this.saveStore('relationships', val); }

  get credentials() { return this.getStore('credentials', SEED_CREDENTIALS); }
  set credentials(val) { this.saveStore('credentials', val); }

  get wallets() { return this.getStore('wallets', SEED_WALLETS); }
  set wallets(val) { this.saveStore('wallets', val); }

  get transactions() { return this.getStore('stellar_transactions', []); }
  set transactions(val) { this.saveStore('stellar_transactions', val); }
}

export const mockDb = new MockDatabase();

// ============================================================================
// UNIFIED DATA ACCESS METHODS (db)
// ============================================================================

export const db = {
  // --- GENERAL ENTITIES ---
  async getEntities(): Promise<Entity[]> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!.from('entities').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
    return mockDb.entities;
  },

  async getEntityBySlug(slug: string): Promise<Entity | null> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!.from('entities').select('*').eq('slug', slug).maybeSingle();
      if (error) throw error;
      return data;
    }
    return mockDb.entities.find((e) => e.slug === slug) || null;
  },

  async getEntityById(id: string): Promise<Entity | null> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!.from('entities').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    }
    return mockDb.entities.find((e) => e.id === id) || null;
  },

  async createEntity(entity: Omit<Entity, 'id' | 'created_at' | 'updated_at'>): Promise<Entity> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newEntity: Entity = {
      ...entity,
      id,
      created_at: now,
      updated_at: now,
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase!.from('entities').insert(newEntity).select().single();
      if (error) throw error;
      return data;
    }

    const current = mockDb.entities;
    current.push(newEntity);
    mockDb.entities = current;
    return newEntity;
  },

  async updateEntity(id: string, updates: Partial<Entity>): Promise<Entity> {
    const now = new Date().toISOString();

    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('entities')
        .update({ ...updates, updated_at: now })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const current = mockDb.entities;
    const index = current.findIndex((e) => e.id === id);
    if (index === -1) throw new Error(`Entity not found: ${id}`);
    const updated = { ...current[index], ...updates, updated_at: now };
    current[index] = updated;
    mockDb.entities = current;
    return updated;
  },

  async deleteEntity(id: string): Promise<boolean> {
    if (isSupabaseConfigured) {
      const { error } = await supabase!.from('entities').delete().eq('id', id);
      if (error) throw error;
      return true;
    }

    mockDb.entities = mockDb.entities.filter((e) => e.id !== id);
    mockDb.people = mockDb.people.filter((p) => p.entity_id !== id);
    mockDb.organizations = mockDb.organizations.filter((o) => o.entity_id !== id);
    mockDb.providers = mockDb.providers.filter((pr) => pr.entity_id !== id);
    mockDb.events = mockDb.events.filter((ev) => ev.entity_id !== id);
    mockDb.relationships = mockDb.relationships.filter((r) => r.from_entity_id !== id && r.to_entity_id !== id);
    mockDb.credentials = mockDb.credentials.filter((c) => c.issuer_entity_id !== id && c.subject_entity_id !== id);
    mockDb.wallets = mockDb.wallets.filter((w) => w.entity_id !== id);
    return true;
  },

  // --- PEOPLE ---
  async getPeople(): Promise<(Person & { entity: Entity })[]> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('people')
        .select('*, entity:entities(*)');
      if (error) throw error;
      return data || [];
    }

    return mockDb.people.map((p) => {
      const entity = mockDb.entities.find((e) => e.id === p.entity_id)!;
      return { ...p, entity };
    });
  },

  async getPersonByEntitySlug(slug: string): Promise<(Person & { entity: Entity }) | null> {
    const entity = await this.getEntityBySlug(slug);
    if (!entity) return null;

    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('people')
        .select('*')
        .eq('entity_id', entity.id)
        .maybeSingle();
      if (error) throw error;
      return data ? { ...data, entity } : null;
    }

    const person = mockDb.people.find((p) => p.entity_id === entity.id);
    return person ? { ...person, entity } : null;
  },

  async getPersonByEntityId(entityId: string): Promise<Person | null> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('people')
        .select('*')
        .eq('entity_id', entityId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
    return mockDb.people.find((p) => p.entity_id === entityId) || null;
  },

  async createPerson(
    entity: Omit<Entity, 'id' | 'type' | 'created_at' | 'updated_at'>,
    person: Omit<Person, 'id' | 'entity_id' | 'created_at' | 'updated_at'>
  ): Promise<Person & { entity: Entity }> {
    const newEntity = await this.createEntity({
      ...entity,
      type: 'person',
    });

    const now = new Date().toISOString();
    const newPerson: Person = {
      ...person,
      id: crypto.randomUUID(),
      entity_id: newEntity.id,
      created_at: now,
      updated_at: now,
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase!.from('people').insert(newPerson).select().single();
      if (error) throw error;
      return { ...data, entity: newEntity };
    }

    const current = mockDb.people;
    current.push(newPerson);
    mockDb.people = current;
    return { ...newPerson, entity: newEntity };
  },

  async updatePerson(
    entityId: string,
    entityUpdates: Partial<Entity>,
    personUpdates: Partial<Person>
  ): Promise<Person & { entity: Entity }> {
    const updatedEntity = await this.updateEntity(entityId, entityUpdates);
    const now = new Date().toISOString();

    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('people')
        .update({ ...personUpdates, updated_at: now })
        .eq('entity_id', entityId)
        .select()
        .single();
      if (error) throw error;
      return { ...data, entity: updatedEntity };
    }

    const current = mockDb.people;
    const index = current.findIndex((p) => p.entity_id === entityId);
    if (index === -1) throw new Error(`Person not found for entity: ${entityId}`);
    const updatedPerson = { ...current[index], ...personUpdates, updated_at: now };
    current[index] = updatedPerson;
    mockDb.people = current;
    return { ...updatedPerson, entity: updatedEntity };
  },

  // --- ORGANIZATIONS ---
  async getOrganizations(): Promise<(Organization & { entity: Entity })[]> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('organizations')
        .select('*, entity:entities(*)');
      if (error) throw error;
      return data || [];
    }

    return mockDb.organizations.map((org) => {
      const entity = mockDb.entities.find((e) => e.id === org.entity_id)!;
      return { ...org, entity };
    });
  },

  async getOrganizationByEntitySlug(slug: string): Promise<(Organization & { entity: Entity }) | null> {
    const entity = await this.getEntityBySlug(slug);
    if (!entity) return null;

    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('organizations')
        .select('*')
        .eq('entity_id', entity.id)
        .maybeSingle();
      if (error) throw error;
      return data ? { ...data, entity } : null;
    }

    const org = mockDb.organizations.find((o) => o.entity_id === entity.id);
    return org ? { ...org, entity } : null;
  },

  async getOrganizationByEntityId(entityId: string): Promise<Organization | null> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('organizations')
        .select('*')
        .eq('entity_id', entityId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
    return mockDb.organizations.find((o) => o.entity_id === entityId) || null;
  },

  async createOrganization(
    entity: Omit<Entity, 'id' | 'type' | 'created_at' | 'updated_at'>,
    org: Omit<Organization, 'id' | 'entity_id' | 'created_at' | 'updated_at'>
  ): Promise<Organization & { entity: Entity }> {
    const newEntity = await this.createEntity({
      ...entity,
      type: 'organization',
    });

    const now = new Date().toISOString();
    const newOrg: Organization = {
      ...org,
      id: crypto.randomUUID(),
      entity_id: newEntity.id,
      created_at: now,
      updated_at: now,
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase!.from('organizations').insert(newOrg).select().single();
      if (error) throw error;
      return { ...data, entity: newEntity };
    }

    const current = mockDb.organizations;
    current.push(newOrg);
    mockDb.organizations = current;
    return { ...newOrg, entity: newEntity };
  },

  async updateOrganization(
    entityId: string,
    entityUpdates: Partial<Entity>,
    orgUpdates: Partial<Organization>
  ): Promise<Organization & { entity: Entity }> {
    const updatedEntity = await this.updateEntity(entityId, entityUpdates);
    const now = new Date().toISOString();

    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('organizations')
        .update({ ...orgUpdates, updated_at: now })
        .eq('entity_id', entityId)
        .select()
        .single();
      if (error) throw error;
      return { ...data, entity: updatedEntity };
    }

    const current = mockDb.organizations;
    const index = current.findIndex((o) => o.entity_id === entityId);
    if (index === -1) throw new Error(`Organization not found for entity: ${entityId}`);
    const updatedOrg = { ...current[index], ...orgUpdates, updated_at: now };
    current[index] = updatedOrg;
    mockDb.organizations = current;
    return { ...updatedOrg, entity: updatedEntity };
  },

  // --- PROVIDERS ---
  async getProviders(): Promise<(Provider & { entity: Entity })[]> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('providers')
        .select('*, entity:entities(*)');
      if (error) throw error;
      return data || [];
    }

    return mockDb.providers.map((p) => {
      const entity = mockDb.entities.find((e) => e.id === p.entity_id)!;
      return { ...p, entity };
    });
  },

  async getProviderByEntitySlug(slug: string): Promise<(Provider & { entity: Entity }) | null> {
    const entity = await this.getEntityBySlug(slug);
    if (!entity) return null;

    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('providers')
        .select('*')
        .eq('entity_id', entity.id)
        .maybeSingle();
      if (error) throw error;
      return data ? { ...data, entity } : null;
    }

    const provider = mockDb.providers.find((p) => p.entity_id === entity.id);
    return provider ? { ...provider, entity } : null;
  },

  async getProviderByEntityId(entityId: string): Promise<Provider | null> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('providers')
        .select('*')
        .eq('entity_id', entityId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
    return mockDb.providers.find((p) => p.entity_id === entityId) || null;
  },

  async createProvider(
    entity: Omit<Entity, 'id' | 'type' | 'created_at' | 'updated_at'>,
    provider: Omit<Provider, 'id' | 'entity_id' | 'created_at' | 'updated_at'>
  ): Promise<Provider & { entity: Entity }> {
    const newEntity = await this.createEntity({
      ...entity,
      type: 'provider',
    });

    const now = new Date().toISOString();
    const newProvider: Provider = {
      ...provider,
      id: crypto.randomUUID(),
      entity_id: newEntity.id,
      created_at: now,
      updated_at: now,
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase!.from('providers').insert(newProvider).select().single();
      if (error) throw error;
      return { ...data, entity: newEntity };
    }

    const current = mockDb.providers;
    current.push(newProvider);
    mockDb.providers = current;
    return { ...newProvider, entity: newEntity };
  },

  async updateProvider(
    entityId: string,
    entityUpdates: Partial<Entity>,
    providerUpdates: Partial<Provider>
  ): Promise<Provider & { entity: Entity }> {
    const updatedEntity = await this.updateEntity(entityId, entityUpdates);
    const now = new Date().toISOString();

    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('providers')
        .update({ ...providerUpdates, updated_at: now })
        .eq('entity_id', entityId)
        .select()
        .single();
      if (error) throw error;
      return { ...data, entity: updatedEntity };
    }

    const current = mockDb.providers;
    const index = current.findIndex((p) => p.entity_id === entityId);
    if (index === -1) throw new Error(`Provider not found for entity: ${entityId}`);
    const updatedProvider = { ...current[index], ...providerUpdates, updated_at: now };
    current[index] = updatedProvider;
    mockDb.providers = current;
    return { ...updatedProvider, entity: updatedEntity };
  },

  // --- EVENTS ---
  async getEvents(): Promise<(Event & { entity: Entity })[]> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('events')
        .select('*, entity:entities(*)');
      if (error) throw error;
      return data || [];
    }

    return mockDb.events.map((ev) => {
      const entity = mockDb.entities.find((e) => e.id === ev.entity_id)!;
      return { ...ev, entity };
    });
  },

  async getEventBySlug(slug: string): Promise<(Event & { entity: Entity }) | null> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('events')
        .select('*, entity:entities(*)')
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    const event = mockDb.events.find((ev) => ev.slug === slug);
    if (!event) return null;
    const entity = mockDb.entities.find((e) => e.id === event.entity_id)!;
    return { ...event, entity };
  },

  // --- RELATIONSHIPS ---
  async getRelationships(): Promise<PopulatedRelationship[]> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('relationships')
        .select('*, fromEntity:entities!relationships_from_entity_id_fkey(*), toEntity:entities!relationships_to_entity_id_fkey(*)');
      if (error) throw error;
      return data || [];
    }

    return mockDb.relationships.map((r) => {
      const fromEntity = mockDb.entities.find((e) => e.id === r.from_entity_id)!;
      const toEntity = mockDb.entities.find((e) => e.id === r.to_entity_id)!;
      return { ...r, fromEntity, toEntity };
    });
  },

  async createRelationship(
    relationship: Omit<Relationship, 'id' | 'created_at' | 'updated_at'>
  ): Promise<Relationship> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newRel: Relationship = {
      ...relationship,
      id,
      created_at: now,
      updated_at: now,
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase!.from('relationships').insert(newRel).select().single();
      if (error) throw error;
      return data;
    }

    const current = mockDb.relationships;
    current.push(newRel);
    mockDb.relationships = current;
    return newRel;
  },

  async deleteRelationship(id: string): Promise<boolean> {
    if (isSupabaseConfigured) {
      const { error } = await supabase!.from('relationships').delete().eq('id', id);
      if (error) throw error;
      return true;
    }

    mockDb.relationships = mockDb.relationships.filter((r) => r.id !== id);
    return true;
  },

  // --- CREDENTIALS ---
  async getCredentials(): Promise<PopulatedCredential[]> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('credentials')
        .select('*, issuerEntity:entities!credentials_issuer_entity_id_fkey(*), subjectEntity:entities!credentials_subject_entity_id_fkey(*), event:events(*)');
      if (error) throw error;
      return data || [];
    }

    return mockDb.credentials.map((c) => {
      const issuerEntity = mockDb.entities.find((e) => e.id === c.issuer_entity_id)!;
      const subjectEntity = mockDb.entities.find((e) => e.id === c.subject_entity_id)!;
      const event = mockDb.events.find((ev) => ev.id === c.event_id) || null;
      return { ...c, issuerEntity, subjectEntity, event };
    });
  },

  async getCredentialByCode(code: string): Promise<PopulatedCredential | null> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('credentials')
        .select('*, issuerEntity:entities!credentials_issuer_entity_id_fkey(*), subjectEntity:entities!credentials_subject_entity_id_fkey(*), event:events(*)')
        .eq('credential_code', code)
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    const cred = mockDb.credentials.find((c) => c.credential_code === code);
    if (!cred) return null;
    const issuerEntity = mockDb.entities.find((e) => e.id === cred.issuer_entity_id)!;
    const subjectEntity = mockDb.entities.find((e) => e.id === cred.subject_entity_id)!;
    const event = mockDb.events.find((ev) => ev.id === cred.event_id) || null;
    return { ...cred, issuerEntity, subjectEntity, event };
  },

  async createCredential(
    credential: Omit<Credential, 'id' | 'created_at' | 'updated_at'>
  ): Promise<Credential> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newCred: Credential = {
      ...credential,
      id,
      created_at: now,
      updated_at: now,
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase!.from('credentials').insert(newCred).select().single();
      if (error) throw error;
      return data;
    }

    const current = mockDb.credentials;
    current.push(newCred);
    mockDb.credentials = current;
    return newCred;
  },

  async updateCredential(id: string, updates: Partial<Credential>): Promise<Credential> {
    const now = new Date().toISOString();

    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('credentials')
        .update({ ...updates, updated_at: now })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const current = mockDb.credentials;
    const index = current.findIndex((c) => c.id === id);
    if (index === -1) throw new Error(`Credential not found: ${id}`);
    const updated = { ...current[index], ...updates, updated_at: now };
    current[index] = updated;
    mockDb.credentials = current;
    return updated;
  },

  // --- WALLETS ---
  async getWalletByEntityId(entityId: string): Promise<Wallet | null> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!
        .from('wallets')
        .select('*')
        .eq('entity_id', entityId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
    return mockDb.wallets.find((w) => w.entity_id === entityId) || null;
  },

  async createOrUpdateWallet(entityId: string, wallet: Omit<Wallet, 'id' | 'entity_id' | 'created_at' | 'updated_at'>): Promise<Wallet> {
    const now = new Date().toISOString();
    const existing = await this.getWalletByEntityId(entityId);

    if (existing) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase!
          .from('wallets')
          .update({ ...wallet, updated_at: now })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      const current = mockDb.wallets;
      const index = current.findIndex((w) => w.id === existing.id);
      const updated = { ...current[index], ...wallet, updated_at: now };
      current[index] = updated;
      mockDb.wallets = current;
      return updated;
    } else {
      const id = crypto.randomUUID();
      const newWallet: Wallet = {
        ...wallet,
        id,
        entity_id: entityId,
        created_at: now,
        updated_at: now,
      };

      if (isSupabaseConfigured) {
        const { data, error } = await supabase!.from('wallets').insert(newWallet).select().single();
        if (error) throw error;
        return data;
      }

      const current = mockDb.wallets;
      current.push(newWallet);
      mockDb.wallets = current;
      return newWallet;
    }
  },
};
