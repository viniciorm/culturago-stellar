import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryIdentityStore } from '@/infrastructure/auth/InMemoryIdentityStore';
import { ClaimService } from '@/infrastructure/auth/ClaimService';

describe('ClaimService', () => {
  let store: InMemoryIdentityStore;
  let service: ClaimService;

  beforeEach(() => {
    store = new InMemoryIdentityStore();
    service = new ClaimService(store);
  });

  it('claims a pending account with a single-use code', async () => {
    await store.createAccount({
      id: 'acc-1',
      status: 'pending_claim',
      personEntityId: null,
      walletContractAddress: null,
    });
    const code = await service.createClaimCode('acc-1');
    const claimedId = await service.claimAccount(code);
    expect(claimedId).toBe('acc-1');

    const account = await store.getAccount('acc-1');
    expect(account?.status).toBe('active');
  });

  it('rejects an already-consumed claim code', async () => {
    await store.createAccount({
      id: 'acc-2',
      status: 'pending_claim',
      personEntityId: null,
      walletContractAddress: null,
    });
    const code = await service.createClaimCode('acc-2');
    await service.claimAccount(code);
    await expect(service.claimAccount(code)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects claiming an account that is not pending_claim', async () => {
    await store.createAccount({
      id: 'acc-3',
      status: 'active',
      personEntityId: null,
      walletContractAddress: null,
    });
    const code = await service.createClaimCode('acc-3');
    await expect(service.claimAccount(code)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  it('recovers an active account with a recovery code', async () => {
    await store.createAccount({
      id: 'acc-4',
      status: 'active',
      personEntityId: null,
      walletContractAddress: null,
    });
    const code = await service.createRecoveryCode('acc-4');
    const recovered = await service.recoverAccount(code);
    expect(recovered).toBe('acc-4');
  });

  it('rejects an invalid recovery code', async () => {
    await expect(service.recoverAccount('not-a-valid-code')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
