/**
 * Canonical hashing port. Implementations (browser, Node, Rust CLI) must
 * produce identical bytes and digests for the same document and schema.
 * Any failure MUST throw a DomainError: silent fallbacks are forbidden.
 */
export type HashSchemaId =
  | 'culturago.entity.v1'
  | 'culturago.credential.v1'
  | 'culturago.fingerprint.v1';

export const HASH_SCHEMA_CODES: Readonly<Record<HashSchemaId, number>> = {
  'culturago.entity.v1': 1,
  'culturago.credential.v1': 2,
  'culturago.fingerprint.v1': 0,
};

export interface CanonicalHashPort {
  /**
   * Returns the lowercase hex SHA-256 of
   * `SHA-256("CULTURAGO\0" || schemaId || "\0" || canonicalUtf8Bytes)`.
   */
  hashDocument(schemaId: HashSchemaId, document: unknown): Promise<string>;
  canonicalize(schemaId: HashSchemaId, document: unknown): Promise<string>;
}
