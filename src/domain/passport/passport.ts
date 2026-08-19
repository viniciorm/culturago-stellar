import { CredentialRecord } from '../credentials/credential';
import { credentialTypeName } from '../credentials/catalog';

export type PassportEntryStatus = 'issued' | 'revoked' | 'pending_confirmation';

export interface PassportEntry {
  credentialId: string;
  credentialCode: string;
  eventId: string;
  credentialType: string;
  status: PassportEntryStatus;
  issuedIntentAt: string;
  issuedLedger: number | null;
  revokedAt: string | null;
}

/**
 * The passport is a stable projection of identity plus a multi-event
 * trajectory. It is never a mutable contract object: revoking or adding a
 * credential appends/annotates entries, it never rewrites identity.
 */
export interface PassportProjection {
  subjectId: string;
  entries: readonly PassportEntry[];
}

export function projectPassport(
  subjectId: string,
  credentials: readonly CredentialRecord[]
): PassportProjection {
  const entries = credentials
    .filter((c) => c.subjectId === subjectId)
    .map((c): PassportEntry => ({
      credentialId: c.credentialId,
      credentialCode: c.credentialCode,
      eventId: c.eventId,
      credentialType: credentialTypeName(c.credentialType),
      status:
        c.status === 'revoked'
          ? 'revoked'
          : c.issuedLedger === null
            ? 'pending_confirmation'
            : 'issued',
      issuedIntentAt: c.issuedIntentAt,
      issuedLedger: c.issuedLedger,
      revokedAt: c.revokedAt,
    }))
    .sort((a, b) => a.issuedIntentAt.localeCompare(b.issuedIntentAt));
  return { subjectId, entries };
}

export function groupByEvent(
  passport: PassportProjection
): ReadonlyMap<string, readonly PassportEntry[]> {
  const groups = new Map<string, PassportEntry[]>();
  for (const entry of passport.entries) {
    const list = groups.get(entry.eventId) ?? [];
    list.push(entry);
    groups.set(entry.eventId, list);
  }
  return groups;
}
