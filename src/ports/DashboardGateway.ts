import { DashboardStats } from '../domain/dashboard/dashboardStats';

/**
 * Persistence port for dashboard read models. Adapters must return
 * aggregated, non-authoritative counts and summaries for the UI.
 */
export interface DashboardGateway {
  getDashboardStats(): Promise<DashboardStats>;
}
