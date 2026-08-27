import 'server-only';
import { StellarGateway } from '../../ports/StellarGateway';
import { createMockStellarGateway } from './MockStellarGateway';
import { InMemoryOperationStore } from './InMemoryOperationStore';
import { PostgreSQLOperationStore } from './PostgreSQLOperationStore';
import { SdkSorobanTransport } from './SdkSorobanTransport';
import { SorobanStellarGateway } from './SorobanStellarGateway';
import { getStellarNetworkConfig } from './networkConfig';
import { isPersistenceConfigured } from '../config/env';

// Singleton para que prepare y submit compartan el estado en memoria
// cuando no haya PostgreSQL configurado (local dev / fallback temporal).
const inMemoryStore = new InMemoryOperationStore();

/**
 * Factory for the concrete StellarGateway.
 * - demo: in-memory mock, no network.
 * - testnet/mainnet: PostgreSQL operation store when DATABASE_URL is set;
 *   otherwise in-memory (local dev / demo fallback only).
 */
export function createStellarGateway(): { gateway: StellarGateway } {
  const env = process.env.NEXT_PUBLIC_CULTURAGO_ENV;
  if (env === 'demo') {
    return createMockStellarGateway({ signer: null });
  }
  const config = getStellarNetworkConfig();
  const transport = new SdkSorobanTransport(config);
  const store = isPersistenceConfigured() ? new PostgreSQLOperationStore() : inMemoryStore;
  console.log('[createStellarGateway] persistence configured:', isPersistenceConfigured(), 'store:', store.constructor.name);
  const gateway = new SorobanStellarGateway(config, transport, store, null);
  return { gateway };
}
