'use server';

import { NextResponse } from 'next/server';
import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { query } from '@/infrastructure/database/pool';

export async function GET(): Promise<NextResponse> {
  const checks: Record<string, 'ok' | 'n/a' | 'error'> = {
    app: 'ok',
  };

  if (isPersistenceConfigured()) {
    try {
      await query('SELECT 1');
      checks.database = 'ok';
    } catch {
      // Do not expose the connection string or other secrets in the response.
      checks.database = 'error';
    }
  } else {
    checks.database = 'n/a';
  }

  const healthy = !Object.values(checks).some((value) => value === 'error');
  const status = healthy ? 200 : 503;
  const payload = {
    status: healthy ? 'ok' : 'degraded',
    checks,
  };

  return NextResponse.json(payload, { status });
}
