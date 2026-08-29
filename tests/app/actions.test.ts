import { describe, expect, it } from 'vitest';
import { verifyCredentialOnChain, verifyCredentialOnChainByCode } from '@/app/actions';

describe('app/actions', () => {
  it('verifyCredentialOnChain requires DATABASE_URL', async () => {
    await expect(verifyCredentialOnChain('00000000-0000-0000-0000-000000000001')).rejects.toSatisfy(
      (e) => e instanceof Error && e.message.includes('Persistence not configured')
    );
  });

  it('verifyCredentialOnChainByCode requires DATABASE_URL', async () => {
    await expect(verifyCredentialOnChainByCode('CRED-TEST-001')).rejects.toSatisfy(
      (e) => e instanceof Error && e.message.includes('Persistence not configured')
    );
  });
});
