import { NextResponse } from 'next/server';
import { metrics } from '@/infrastructure/observability/Metrics';
import { query } from '@/infrastructure/database/pool';

export async function GET() {
  const pgHealth = await query('SELECT 1 as ok')
    .then(() => 'ok')
    .catch(() => 'down');
  metrics.gauge('pg.health', pgHealth === 'ok' ? 1 : 0);
  return NextResponse.json({
    metrics: metrics.snapshot(),
    checks: { pg: pgHealth },
  });
}
