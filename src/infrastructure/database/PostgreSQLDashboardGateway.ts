import 'server-only';
import { DashboardGateway } from '../../ports/DashboardGateway';
import { DashboardStats } from '../../domain/dashboard/dashboardStats';
import { query } from './pool';

/**
 * PostgreSQL adapter for the dashboard read model. Returns aggregate counts
 * from the real persistence tables and the Stellar operation outbox.
 */
export class PostgreSQLDashboardGateway implements DashboardGateway {
  async getDashboardStats(): Promise<DashboardStats> {
    const [
      schools,
      dancers,
      teachers,
      providers,
      credentialsIssued,
      pendingStellar,
      registeredStellar,
      walletsClaimed,
    ] = await Promise.all([
      this.countSchools(),
      this.countPeopleByRole('dancer'),
      this.countPeopleByRoles(['teacher', 'director']),
      this.countProviders(),
      this.countIssuedCredentials(),
      this.countStellarOperations(['signing', 'submitted', 'confirming', 'restoring', 'failed_retryable', 'failed_terminal']),
      this.countStellarOperations(['confirmed']),
      this.countClaimedWallets(),
    ]);

    return {
      schools,
      dancers,
      teachers,
      providers,
      credentialsIssued,
      pendingStellar,
      registeredStellar,
      walletsClaimed,
    };
  }

  private async countSchools(): Promise<number> {
    const result = await query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM organizations WHERE organization_type = 'school'"
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  private async countPeopleByRole(role: string): Promise<number> {
    const result = await query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM people WHERE main_role = $1',
      [role]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  private async countPeopleByRoles(roles: readonly string[]): Promise<number> {
    if (roles.length === 0) return 0;
    const placeholders = roles.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM people WHERE main_role IN (${placeholders})`,
      [...roles]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  private async countProviders(): Promise<number> {
    const result = await query<{ count: string }>('SELECT COUNT(*) AS count FROM providers');
    return Number(result.rows[0]?.count ?? 0);
  }

  private async countIssuedCredentials(): Promise<number> {
    const result = await query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM credentials WHERE status = 'issued'"
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  private async countStellarOperations(phases: readonly string[]): Promise<number> {
    if (phases.length === 0) return 0;
    const placeholders = phases.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM stellar_operations WHERE phase IN (${placeholders})`,
      [...phases]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  private async countClaimedWallets(): Promise<number> {
    const result = await query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM wallets WHERE wallet_status = 'claimed'"
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}
