import { NextResponse } from 'next/server';
import { metrics } from '@/infrastructure/observability/Metrics';
import { query } from '@/infrastructure/database/pool';
import { stellarWorkerManager } from '@/infrastructure/stellar/StellarWorkerManager';
import { createStellarGateway } from '@/infrastructure/stellar/createStellarGateway';

export async function GET() {
  const pgHealth = await query('SELECT 1 as ok')
    .then(() => 'ok')
    .catch(() => 'down');
  metrics.gauge('pg.health', pgHealth === 'ok' ? 1 : 0);

  const workerHealth = stellarWorkerManager.getHealth();
  const workerStaleMs = workerHealth.lastHeartbeat ? Date.now() - workerHealth.lastHeartbeat : null;
  const workerUp = workerHealth.started && (workerStaleMs === null || workerStaleMs < 60_000);
  metrics.gauge('worker.health', workerUp ? 1 : 0);

  const { store } = createStellarGateway();
  const phaseCounts = await store.countByPhase();

  return NextResponse.json({
    metrics: metrics.snapshot(),
    checks: {
      pg: pgHealth,
      worker: workerUp ? 'ok' : 'down',
    },
    worker: {
      ...workerHealth,
      staleMs: workerStaleMs,
    },
    phases: phaseCounts,
  });
}
