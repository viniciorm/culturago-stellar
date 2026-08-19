import { domainError } from '../errors';

/**
 * Versioned catalog of credential types. The numeric code is the on-chain
 * representation (`credential_type: u32`); the name is the off-chain label.
 * Adding a type requires bumping CREDENTIAL_CATALOG_VERSION and must never
 * reassign existing codes.
 */
export const CREDENTIAL_CATALOG_VERSION = 1;

export const CREDENTIAL_TYPES = {
  dancer_participant: 1,
  school_participant: 2,
  teacher_director: 3,
  official_photographer: 4,
  official_videographer: 5,
  venue_sponsor: 6,
} as const;

export type CredentialTypeName = keyof typeof CREDENTIAL_TYPES;
export type CredentialTypeCode = (typeof CREDENTIAL_TYPES)[CredentialTypeName];

const NAME_BY_CODE = new Map<number, CredentialTypeName>(
  (Object.entries(CREDENTIAL_TYPES) as [CredentialTypeName, CredentialTypeCode][]).map(
    ([name, code]) => [code, name]
  )
);

export function credentialTypeCode(name: string): CredentialTypeCode {
  const code = CREDENTIAL_TYPES[name as CredentialTypeName];
  if (code === undefined) {
    throw domainError('UNKNOWN_CREDENTIAL_TYPE', `Unknown credential type: ${name}`);
  }
  return code;
}

export function credentialTypeName(code: number): CredentialTypeName {
  const name = NAME_BY_CODE.get(code);
  if (name === undefined) {
    throw domainError('UNKNOWN_CREDENTIAL_TYPE', `Unknown credential type code: ${code}`);
  }
  return name;
}

export function isKnownCredentialType(name: string): name is CredentialTypeName {
  return name in CREDENTIAL_TYPES;
}
