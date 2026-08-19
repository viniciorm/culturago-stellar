import { runDatabaseGatewayContract } from './databaseGateway.contract';
import { InMemoryDatabaseGateway } from '../fixtures/inMemoryDatabaseGateway';

runDatabaseGatewayContract('in-memory', () => new InMemoryDatabaseGateway());
