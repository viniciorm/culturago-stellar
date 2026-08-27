import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { stellarWorkerManager } from '@/infrastructure/stellar/StellarWorkerManager';

const originalEnv = { ...process.env };

function setTestnetEnv(): void {
  process.env.NEXT_PUBLIC_CULTURAGO_ENV = 'testnet';
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL = 'https://soroban-testnet.stellar.org';
  process.env.NEXT_PUBLIC_ENTITY_REGISTRY_CONTRACT_ID = 'CBUUMXY77DF4QG5KY5H37SEV63HOLPIVEUZGP2UEQ4PGBNWC2JYFJQGO';
  process.env.NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID = 'CBQPZU6O2HTURYQBMYYZ3DDZBTT67AYCXMT5YUYOSVQU5PUCBW642RJ6';
  process.env.STELLAR_WORKER_ENABLED = 'true';
}

describe('StellarWorkerManager', () => {
  beforeAll(() => {
    // Ensure the manager is stopped before any test runs.
    stellarWorkerManager.stop();
  });

  afterAll(() => {
    stellarWorkerManager.stop();
    process.env = originalEnv;
  });

  it('does not start in demo mode by default', () => {
    process.env.NEXT_PUBLIC_CULTURAGO_ENV = 'demo';
    process.env.STELLAR_WORKER_ENABLED = '';
    stellarWorkerManager.start();
    expect(stellarWorkerManager['started']).toBe(false);
    stellarWorkerManager.stop();
  });

  it('starts and stops a worker in testnet when enabled', async () => {
    setTestnetEnv();
    stellarWorkerManager.start();
    expect(stellarWorkerManager['started']).toBe(true);

    // Give the loop at least one chance to claim a batch.
    await new Promise((resolve) => setTimeout(resolve, 50));

    stellarWorkerManager.stop();
    expect(stellarWorkerManager['started']).toBe(false);
  });
});
