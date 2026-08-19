import { domainError } from '../../domain/errors';

/**
 * Deterministic JSON canonicalization (JCS / RFC 8785 profile):
 * - object keys sorted by UTF-16 code units
 * - no insignificant whitespace
 * - numbers serialized with ECMAScript Number::toString (shortest round-trip)
 * - rejects undefined, functions, symbols, non-finite numbers, cycles
 *
 * MUST produce byte-identical output in browser, Node and any CLI port.
 */
export function canonicalizeJson(value: unknown, seen: Set<unknown> = new Set()): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw domainError('INVALID_INPUT', 'Non-finite numbers cannot be canonicalized');
      }
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (seen.has(value)) {
        throw domainError('INVALID_INPUT', 'Cyclic structures cannot be canonicalized');
      }
      seen.add(value);
      try {
        if (Array.isArray(value)) {
          return `[${value.map((item) => {
            if (item === undefined || typeof item === 'function' || typeof item === 'symbol') {
              throw domainError('INVALID_INPUT', 'Arrays cannot contain undefined/functions/symbols');
            }
            return canonicalizeJson(item, seen);
          }).join(',')}]`;
        }
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record).sort();
        const entries = keys.map((key) => {
          const v = record[key];
          if (v === undefined || typeof v === 'function' || typeof v === 'symbol') {
            throw domainError('INVALID_INPUT', `Property "${key}" is not canonicalizable`);
          }
          return `${JSON.stringify(key)}:${canonicalizeJson(v, seen)}`;
        });
        return `{${entries.join(',')}}`;
      } finally {
        seen.delete(value);
      }
    }
    default:
      throw domainError('INVALID_INPUT', `Type ${typeof value} cannot be canonicalized`);
  }
}

/** Domain separation envelope: "CULTURAGO\0" || schemaId || "\0" || canonical bytes. */
export function buildDigestInput(schemaId: string, canonicalUtf8: string): Uint8Array {
  return new TextEncoder().encode(`CULTURAGO\0${schemaId}\0${canonicalUtf8}`);
}
