'use server';

import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { PostgreSQLDashboardGateway } from '@/infrastructure/database/PostgreSQLDashboardGateway';
import { DashboardStats } from '@/domain/dashboard/dashboardStats';
import { db } from '@/lib/db';

async function statsFromMock(): Promise<DashboardStats> {
  const [entities, people, orgs, providers, credentials] = await Promise.all([
    db.getEntities(),
    db.getPeople(),
    db.getOrganizations(),
    db.getProviders(),
    db.getCredentials(),
  ]);

  const schools = orgs.filter((o) => o.organization_type === 'school').length;
  const dancers = people.filter((p) => p.main_role === 'dancer').length;
  const teachers = people.filter(
    (p) => p.main_role === 'teacher' || p.main_role === 'director'
  ).length;
  const providersCount = providers.length;
  const credentialsIssued = credentials.filter((c) => c.status === 'issued').length;
  const registeredStellar =
    entities.filter((e) => e.stellar_status === 'registered').length +
    credentials.filter((c) => c.stellar_status === 'registered').length;
  const pendingStellar =
    entities.filter((e) => e.stellar_status === 'pending' || e.stellar_status === 'not_registered')
      .length +
    credentials.filter((c) => c.stellar_status === 'pending' || c.stellar_status === 'not_registered')
      .length;
  const walletsClaimed = entities.filter((e) => e.wallet_status === 'claimed').length;

  return {
    schools,
    dancers,
    teachers,
    providers: providersCount,
    credentialsIssued,
    pendingStellar,
    registeredStellar,
    walletsClaimed,
  };
}

/**
 * Returns aggregated dashboard stats. Uses the PostgreSQL persistence layer
 * when configured; otherwise falls back to the in-memory demo mock so the
 * dashboard remains usable in demo/local mode.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  if (isPersistenceConfigured()) {
    const gateway = new PostgreSQLDashboardGateway();
    return gateway.getDashboardStats();
  }
  return statsFromMock();
}
