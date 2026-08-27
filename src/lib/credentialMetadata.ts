import { CanonicalHashService } from '@/infrastructure/hashing/CanonicalHashService';

const canonicalHash = new CanonicalHashService();

/**
 * Deterministic SHA-256 over a canonical JSON credential metadata payload.
 * Uses the same CanonicalHashPort as the Stellar gateway so off-chain and
 * on-chain hashes are comparable. The numeric hash_schema sent to the
 * contract remains 1 because that is the only version currently allowed
 * on the deployed testnet contracts.
 */
export async function computeMetadataHash(payload: Record<string, unknown>): Promise<string> {
  return canonicalHash.hashDocument('culturago.credential.v1', payload);
}

export const credentialTypeToNumber: Record<string, number> = {
  dancer_participant: 1,
  school_participant: 2,
  teacher_director: 3,
  official_photographer: 4,
  official_videographer: 5,
  venue_sponsor: 6,
};

export const numberToCredentialType: Record<number, string> = {
  1: 'dancer_participant',
  2: 'school_participant',
  3: 'teacher_director',
  4: 'official_photographer',
  5: 'official_videographer',
  6: 'venue_sponsor',
};
