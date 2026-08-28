import 'server-only';
import { OperationStore } from '../../ports/OperationStore';
import { StellarGateway } from '../../ports/StellarGateway';
import { InMemoryOperationStore } from './InMemoryOperationStore';
import { InMemoryChainTransport } from './InMemoryChainTransport';
import { PostgreSQLOperationStore } from './PostgreSQLOperationStore';
import { SdkSorobanTransport } from './SdkSorobanTransport';
import { SorobanStellarGateway } from './SorobanStellarGateway';
import { getStellarNetworkConfig } from './networkConfig';
import { getPublicConfig, isPersistenceConfigured } from '../config/env';
import { Logger } from '../observability/Logger';
import { DEMO_CONFIG } from './MockStellarGateway';

// Singletons para que prepare y submit compartan el estado en memoria
// cuando no haya PostgreSQL configurado (local dev / demo fallback temporal).
const inMemoryStore = new InMemoryOperationStore();
const inMemoryTransport = new InMemoryChainTransport();

/**
 * Factory for the concrete StellarGateway.
 * - demo: in-memory mock, no network.
 * - testnet/mainnet: PostgreSQL operation store when DATABASE_URL is set;
 *   otherwise in-memory (local dev / demo fallback only).
 */
export interface StellarGatewayBundle {
  gateway: StellarGateway;
  store: OperationStore;
}

export function createStellarGateway(): StellarGatewayBundle {
  const publicConfig = getPublicConfig();
  if (publicConfig.environment === 'demo') {
    const log = new Logger('createStellarGateway');
    log.info('gateway_created', { persistenceConfigured: false, store: inMemoryStore.constructor.name });
    const gateway = new SorobanStellarGateway(DEMO_CONFIG, inMemoryTransport, inMemoryStore, null);
    return { gateway, store: inMemoryStore };
  }
  const config = getStellarNetworkConfig();
  const transport = isPersistenceConfigured() ? new SdkSorobanTransport(config) : inMemoryTransport;
  const store = isPersistenceConfigured() ? new PostgreSQLOperationStore() : inMemoryStore;
  const log = new Logger('createStellarGateway');
  log.info('gateway_created', { persistenceConfigured: isPersistenceConfigured(), store: store.constructor.name });
  const gateway = new SorobanStellarGateway(config, transport, store, null);
  return { gateway, store };
}
