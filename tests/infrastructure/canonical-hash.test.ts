import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanonicalHashPort } from '@/infrastructure/hashing/canonicalHash';
import { canonicalizeJson } from '@/infrastructure/hashing/canonicalize';
import { sha256Node } from '@/infrastructure/hashing/sha256Node';
import { sha256Web } from '@/infrastructure/hashing/sha256Web';
import {
  buildCredentialMetadataUri,
  buildEntityMetadataUri,
} from '@/domain/metadata/metadataUri';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '..', '..', 'fixtures', 'golden-vectors.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

const nodePort = createCanonicalHashPort(sha256Node);
const webPort = createCanonicalHashPort(sha256Web);

describe('canonicalization', () => {
  it('sorts object keys and strips insignificant whitespace', () => {
    expect(canonicalizeJson({ b: 1, a: 'hola' })).toBe('{"a":"hola","b":1}');
    expect(canonicalizeJson({ z: { b: 2, a: 1 }, a: [] })).toBe('{"a":[],"z":{"a":1,"b":2}}');
  });

  it('serializes nested structures deterministically', () => {
    const doc = { arr: [3, 2, 1], nested: { z: true, y: null } };
    expect(canonicalizeJson(doc)).toBe('{"arr":[3,2,1],"nested":{"y":null,"z":true}}');
  });

  it('rejects non-canonicalizable values with typed errors', () => {
    expect(() => canonicalizeJson({ a: undefined })).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' })
    );
    expect(() => canonicalizeJson(NaN)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' })
    );
    expect(() => canonicalizeJson(Infinity)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' })
    );
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalizeJson(cyclic)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' })
    );
  });
});

describe('golden vectors', () => {
  // Vectors computed once and frozen; any canonicalization drift breaks them.
  const vectors = fixture.vectors as Array<{
    name: string;
    schema: 'culturago.entity.v1' | 'culturago.credential.v1';
    doc: Record<string, unknown>;
    expectedSha256: string;
  }>;

  for (const { name, schema, doc, expectedSha256 } of vectors) {
    it(`node backend matches fixture ${name}`, async () => {
      expect(await nodePort.hashDocument(schema, doc)).toBe(expectedSha256);
    });

    it(`web backend matches fixture ${name}`, async () => {
      expect(await webPort.hashDocument(schema, doc)).toBe(expectedSha256);
    });
  }

  it('node and web backends produce identical digests (parity proof)', async () => {
    const doc = { mixed: ['unicode áéí', 3.14, { k: 'v' }], flag: false };
    expect(await nodePort.hashDocument('culturago.credential.v1', doc)).toBe(
      await webPort.hashDocument('culturago.credential.v1', doc)
    );
  });

  it('rejects unknown schemas — no implicit defaults', async () => {
    await expect(
      nodePort.hashDocument('culturago.unknown.v9' as never, {})
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('metadata URIs', () => {
  const uuid = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';

  it('builds stable namespaced URIs', () => {
    expect(buildEntityMetadataUri(uuid)).toBe(`culturago:entity:v1:${uuid}`);
    expect(buildCredentialMetadataUri(uuid)).toBe(`culturago:credential:v1:${uuid}`);
  });

  it('normalizes case and rejects malformed ids', () => {
    expect(buildEntityMetadataUri(uuid.toUpperCase())).toBe(`culturago:entity:v1:${uuid}`);
    expect(() => buildEntityMetadataUri('not-a-uuid')).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' })
    );
  });
});
