import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/health/route';
import { isPersistenceConfigured } from '@/infrastructure/config/env';

describe('GET /api/health', () => {
  it('returns ok and reports database status based on persistence configuration', async () => {
    const res = await GET();
    const body = (await res.json()) as { status: string; checks: Record<string, string> };

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks.app).toBe('ok');
    expect(body.checks.database).toBe(isPersistenceConfigured() ? 'ok' : 'n/a');
  });
});
