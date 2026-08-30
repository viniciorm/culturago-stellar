import { describe, expect, it } from 'vitest';
import { CanonicalHashService } from '@/infrastructure/hashing/CanonicalHashService';
import { createCanonicalHashPort } from '@/infrastructure/hashing/canonicalHash';
import { canonicalizeJson } from '@/infrastructure/hashing/canonicalize';
import { sha256Node } from '@/infrastructure/hashing/sha256Node';
import { buildDigestInput } from '@/infrastructure/hashing/canonicalize';
import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { getPool, closePool } from '@/infrastructure/database/pool';

const nodePort = createCanonicalHashPort(sha256Node);
const service = new CanonicalHashService();

describe('CanonicalHashService parity with createCanonicalHashPort', () => {
  it('produces the same digests as the node port for object documents', async () => {
    const doc = { b: 1, a: 'hola' };
    const a = await service.hashDocument('culturago.entity.v1', doc);
    const b = await nodePort.hashDocument('culturago.entity.v1', doc);
    expect(a).toBe(b);
  });

  it('produces the same digests for UUID string ids used as subject keys', async () => {
    const id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
    const a = await service.hashDocument('culturago.entity.v1', id);
    const b = await nodePort.hashDocument('culturago.entity.v1', id);
    expect(a).toBe(b);
    expect(a).toBe(await sha256Node(buildDigestInput('culturago.entity.v1', canonicalizeJson(id))));
  });

  it('canonicalizes strings as JSON strings (quoted)', async () => {
    expect(canonicalizeJson('hello')).toBe('"hello"');
  });

  it('is stable under different key insertion order', async () => {
    const a = await service.hashDocument('culturago.credential.v1', { z: 1, a: 2 });
    const b = await service.hashDocument('culturago.credential.v1', { a: 2, z: 1 });
    expect(a).toBe(b);
  });

  it('differs when the payload is altered', async () => {
    const a = await service.hashDocument('culturago.credential.v1', { x: 1 });
    const b = await service.hashDocument('culturago.credential.v1', { x: 2 });
    expect(a).not.toBe(b);
  });
});

describe('UUID TS ↔ SQL parity', () => {
  it('matches the manual digest input that the SQL function must produce', async () => {
    const id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
    const canonical = canonicalizeJson(id); // quoted UUID
    const expectedDigest = await sha256Node(buildDigestInput('culturago.entity.v1', canonical));
    const fromService = await service.hashDocument('culturago.entity.v1', id);
    expect(fromService).toBe(expectedDigest);

    // The SQL equivalent is:
    // SELECT culturago_canonical_hash('culturago.entity.v1', to_json('a1a1a1a1-...')::text);
    // to_json(id) gives a JSON string, ::text yields the quoted canonical form.
  });

  it.skipIf(!isPersistenceConfigured())(
    'matches the installed PostgreSQL culturago_canonical_hash function',
    async () => {
      const id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
      const canonical = canonicalizeJson(id);
      const expectedDigest = await sha256Node(buildDigestInput('culturago.entity.v1', canonical));

      const result = await getPool().query<{ h: string }>(
        'SELECT culturago_canonical_hash($1, to_json($2::text)::text) AS h',
        ['culturago.entity.v1', id]
      );
      expect(result.rows[0].h).toBe(expectedDigest);
      await closePool();
    }
  );
});
