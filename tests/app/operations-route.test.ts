import { beforeAll, describe, expect, it, afterAll } from 'vitest';
import { GET } from '@/app/api/operations/[operationId]/route';

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
});
