import { beforeAll, describe, expect, it, afterAll } from 'vitest';
import { GET } from '@/app/api/operations/[operationId]/route';
import { createStellarGateway } from '@/infrastructure/stellar/createStellarGateway';

describe('/api/operations/[operationId] route', () => {
  const originalEnv: NodeJS.ProcessEnv = { ...process.env };

  beforeAll(() => {
    process.env.NEXT_PUBLIC_CULTURAGO_ENV = 'demo';
    process.env.STELLAR_WORKER_ENABLED = 'false';
  });

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('returns 404 for an unknown operation id', async () => {
    const res = await GET(new Request('http://localhost/api/operations/does-not-exist'), {
      params: Promise.resolve({ operationId: 'does-not-exist' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 for an operation owned by the current actor', async () => {
    const bundle = createStellarGateway();
    const prepared = await bundle.gateway.prepareRegisterEntity({
      idempotencyKey: 'test-own-op',
      actorAddress: 'G_DEMO_ACTOR',
      entityId: '00000000-0000-0000-0000-000000000001',
      metadataHash: 'a'.repeat(64),
      hashSchema: 1,
    });

    const res = await GET(new Request('http://localhost/api/operations/' + prepared.operationId), {
      params: Promise.resolve({ operationId: prepared.operationId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { operation: { operationId: string } };
    expect(body.operation.operationId).toBe(prepared.operationId);
  });

  it('returns 404 for an operation owned by another actor', async () => {
    const bundle = createStellarGateway();
    const prepared = await bundle.gateway.prepareRegisterEntity({
      idempotencyKey: 'test-other-op',
      actorAddress: 'G_OTHER_ACTOR',
      entityId: '00000000-0000-0000-0000-000000000002',
      metadataHash: 'b'.repeat(64),
      hashSchema: 1,
    });

    const res = await GET(new Request('http://localhost/api/operations/' + prepared.operationId), {
      params: Promise.resolve({ operationId: prepared.operationId }),
    });
    expect(res.status).toBe(404);
  });
});
