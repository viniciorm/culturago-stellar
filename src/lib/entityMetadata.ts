import { CanonicalHashService } from '@/infrastructure/hashing/CanonicalHashService';

const canonicalHash = new CanonicalHashService();

/**
 * Deterministic SHA-256 over a canonical JSON entity metadata payload.
 * Uses the same CanonicalHashPort as the Stellar gateway so off-chain and
 * on-chain hashes are comparable. The numeric hash_schema sent to the
 * contract remains 1 because that is the only version currently allowed
 * on the deployed testnet contracts.
 */
export async function computeEntityMetadataHash(
  payload: unknown
): Promise<string> {
  return canonicalHash.hashDocument('culturago.entity.v1', payload);
}

export interface EntityMetadataPayload {
  display_name: string;
  slug: string;
  country: string;
  city: string;
  status: string;
  is_public: boolean;
  organization_type?: string;
  website?: string | null;
  instagram?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}
