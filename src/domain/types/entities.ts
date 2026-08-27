/**
 * UI / persistence-agnostic entity and credential types.
 *
 * Originally part of `src/lib/db.ts`; moved here so the demo mock can be
 * retired independently of the domain model.
 */

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
  organization_type:
    | 'festival'
    | 'school'
    | 'academy'
    | 'company'
    | 'association'
    | 'producer'
    | 'community'
    | 'other';
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
  provider_type:
    | 'venue'
    | 'pub'
    | 'photographer'
    | 'videographer'
    | 'foodtruck'
    | 'sound'
    | 'lighting'
    | 'sponsor'
    | 'streaming'
    | 'security'
    | 'makeup'
    | 'costume'
    | 'ticketing'
    | 'transport'
    | 'other';
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

export type PopulatedRelationship = Relationship & {
  fromEntity: Entity;
  toEntity: Entity;
};

export type PopulatedCredential = Credential & {
  issuerEntity: Entity;
  subjectEntity: Entity;
  event?: Event | null;
};
