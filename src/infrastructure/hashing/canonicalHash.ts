import {
  CanonicalHashPort,
  HashSchemaId,
} from '../../ports/CanonicalHashPort';
import { domainError } from '../../domain/errors';
import { buildDigestInput, canonicalizeJson } from './canonicalize';

const KNOWN_SCHEMAS: readonly HashSchemaId[] = [
  'culturago.entity.v1',
  'culturago.credential.v1',
];

export type Sha256Fn = (bytes: Uint8Array) => Promise<string>;

/**
 * Creates the canonical hashing port over an injected SHA-256 backend
 * (WebCrypto in the browser, node:crypto on the server). Both backends
 * MUST yield identical digests for identical input — covered by tests.
 */
export function createCanonicalHashPort(sha256: Sha256Fn): CanonicalHashPort {
  function assertSchema(schemaId: HashSchemaId): void {
    if (!KNOWN_SCHEMAS.includes(schemaId)) {
      throw domainError('INVALID_INPUT', `Unknown hash schema: ${schemaId}`);
    }
  }

  return {
    async canonicalize(schemaId: HashSchemaId, document: unknown): Promise<string> {
      assertSchema(schemaId);
      return canonicalizeJson(document);
    },
    async hashDocument(schemaId: HashSchemaId, document: unknown): Promise<string> {
      assertSchema(schemaId);
      const canonical = canonicalizeJson(document);
      return sha256(buildDigestInput(schemaId, canonical));
    },
  };
}
