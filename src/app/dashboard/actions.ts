'use server';

import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { PostgreSQLDashboardGateway } from '@/infrastructure/database/PostgreSQLDashboardGateway';
import { DashboardStats } from '@/domain/dashboard/dashboardStats';

const EMPTY_STATS: DashboardStats = {
  schools: 0,
  dancers: 0,
  teachers: 0,
  providers: 0,
  credentialsIssued: 0,
  pendingStellar: 0,
  registeredStellar: 0,
  walletsClaimed: 0,
};

/**
 * Returns aggregated dashboard stats from PostgreSQL. Returns zeros when
 * persistence is not configured; the demo mock is no longer used.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  if (!isPersistenceConfigured()) {
    return EMPTY_STATS;
  }
  const gateway = new PostgreSQLDashboardGateway();
  return gateway.getDashboardStats();
}
