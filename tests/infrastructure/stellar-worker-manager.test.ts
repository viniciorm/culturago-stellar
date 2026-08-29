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
  process.env.STELLAR_WORKER_BATCH_SIZE = '5';
  process.env.STELLAR_WORKER_POLL_INTERVAL_MS = '5000';
  process.env.STELLAR_WORKER_CLAIM_TTL_SECONDS = '60';
  process.env.STELLAR_WORKER_MAX_ATTEMPTS = '10';
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
    expect(stellarWorkerManager.getHealth().started).toBe(true);

    // Give the loop at least one chance to claim a batch and heartbeat.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const health = stellarWorkerManager.getHealth();
    expect(health.started).toBe(true);
    expect(health.lastHeartbeat).not.toBeNull();
    expect(typeof health.lastHeartbeat).toBe('number');

    stellarWorkerManager.stop();
    const stopped = stellarWorkerManager.getHealth();
    expect(stopped.started).toBe(false);
    expect(stopped.lastHeartbeat).toBeNull();
    expect(stopped.startedAt).toBeNull();
  });

  it('rejects non-numeric options and does not start', () => {
    setTestnetEnv();
    process.env.STELLAR_WORKER_BATCH_SIZE = 'foo';
    expect(() => stellarWorkerManager.start()).not.toThrow();
    expect(stellarWorkerManager.getHealth().started).toBe(false);
    stellarWorkerManager.stop();
  });

  it('rejects non-positive options and does not start', () => {
    setTestnetEnv();
    process.env.STELLAR_WORKER_POLL_INTERVAL_MS = '-1';
    expect(() => stellarWorkerManager.start()).not.toThrow();
    expect(stellarWorkerManager.getHealth().started).toBe(false);
    stellarWorkerManager.stop();
  });
});
