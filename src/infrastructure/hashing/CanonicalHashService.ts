import { createHash } from 'crypto';
import { CanonicalHashPort, HashSchemaId } from '../../ports/CanonicalHashPort';

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => sortKeys(v));

  const sorted = Object.keys(value as Record<string, unknown>).sort();
  const result: Record<string, unknown> = {};
  for (const k of sorted) {
    result[k] = sortKeys((value as Record<string, unknown>)[k]);
  }
  return result;
}

function canonicalUtf8(document: unknown): string {
  if (typeof document === 'string') return document;
  if (document === null || document === undefined) return '';
  return JSON.stringify(sortKeys(document));
}

export class CanonicalHashService implements CanonicalHashPort {
  async canonicalize(_schemaId: HashSchemaId, document: unknown): Promise<string> {
    return canonicalUtf8(document);
  }

  async hashDocument(schemaId: HashSchemaId, document: unknown): Promise<string> {
    const canonical = canonicalUtf8(document);
    const prefix = Buffer.from(`CULTURAGO\0${schemaId}\0`, 'utf8');
    const body = Buffer.from(canonical, 'utf8');
    const digest = createHash('sha256')
      .update(Buffer.concat([prefix, body]))
      .digest('hex');

    if (!/^[0-9a-f]{64}$/.test(digest)) {
      throw new Error('Canonical hash did not produce a 64-char lowercase hex digest');
    }

    return digest;
  }
}
