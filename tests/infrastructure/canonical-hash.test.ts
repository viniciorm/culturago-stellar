import { describe, expect, it } from 'vitest';
import { createCanonicalHashPort } from '@/infrastructure/hashing/canonicalHash';
import { canonicalizeJson } from '@/infrastructure/hashing/canonicalize';
import { sha256Node } from '@/infrastructure/hashing/sha256Node';
import { sha256Web } from '@/infrastructure/hashing/sha256Web';
import {
  buildCredentialMetadataUri,
  buildEntityMetadataUri,
} from '@/domain/metadata/metadataUri';

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
  const vectors = [
    {
      schema: 'culturago.entity.v1' as const,
      doc: { b: 1, a: 'hola' },
      expected: 'a12a89a3f9e22fbbf44268d610d591926f673a23f86db5a063e4dde22a9edbdc',
    },
    {
      schema: 'culturago.credential.v1' as const,
      doc: {},
      expected: 'cfa5aa938307ecbb4c81403d85625c3e5cc2deeabfe6585132a8817b79078f13',
    },
    {
      schema: 'culturago.entity.v1' as const,
      doc: { arr: [3, 2, 1], nested: { z: true, y: null } },
      expected: '9c52b708c85bdecf14ce6bd81d878a9bda312b316bb3eb656c7a25fe93dad831',
    },
  ];

  for (const { schema, doc, expected } of vectors) {
    it(`node backend matches vector ${expected.slice(0, 8)}`, async () => {
      expect(await nodePort.hashDocument(schema, doc)).toBe(expected);
    });

    it(`web backend matches vector ${expected.slice(0, 8)}`, async () => {
      expect(await webPort.hashDocument(schema, doc)).toBe(expected);
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
