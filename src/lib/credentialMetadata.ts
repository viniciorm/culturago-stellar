import { createHash } from 'crypto';

/**
 * Computes a deterministic SHA-256 over a canonical JSON payload.
 * The keys are sorted so the hash is stable regardless of insertion order.
 */
export function computeMetadataHash(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)))
  );
  return createHash('sha256').update(canonical).digest('hex');
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
