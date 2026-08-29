import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('returns ok and reports database as n/a when persistence is not configured', async () => {
    const res = await GET();
    const body = (await res.json()) as { status: string; checks: Record<string, string> };

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks.app).toBe('ok');
    expect(body.checks.database).toBe('n/a');
  });
});
