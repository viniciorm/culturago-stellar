import 'server-only';
import { StellarGateway } from '../../ports/StellarGateway';
import { createMockStellarGateway } from './MockStellarGateway';
import { InMemoryOperationStore } from './InMemoryOperationStore';
import { SdkSorobanTransport } from './SdkSorobanTransport';
import { SorobanStellarGateway } from './SorobanStellarGateway';
import { getStellarNetworkConfig } from './networkConfig';

// Singleton para que /api/sign/prepare y /api/sign/submit compartan estado
// en el mismo proceso Node. En producción hay que reemplazar por PostgreSQLOperationStore.
const sharedStore = new InMemoryOperationStore();

/**
 * Factory for the concrete StellarGateway.
 * - demo: in-memory mock, no network.
 * - testnet/mainnet: real Soroban RPC with in-memory operation store.
 */
export function createStellarGateway(): { gateway: StellarGateway } {
  const env = process.env.NEXT_PUBLIC_CULTURAGO_ENV;
  if (env === 'demo') {
    return createMockStellarGateway({ signer: null });
  }
  const config = getStellarNetworkConfig();
  const transport = new SdkSorobanTransport(config);
  const gateway = new SorobanStellarGateway(config, transport, sharedStore, null);
  return { gateway };
}
