import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestActor } from '@/infrastructure/auth/actorContext';

const mocks = vi.hoisted(() => ({ session: vi.fn(), issue: vi.fn(), revoke: vi.fn() }));
vi.mock('@/infrastructure/auth/getActorFromSession', () => ({ requireActorFromSession: mocks.session }));
vi.mock('@/infrastructure/credentials/v2/CredentialV2Service', () => ({
  CredentialV2Service: class { issueCredential = mocks.issue; revokeCredential = mocks.revoke; },
}));
import { issueCredentialV2, revokeCredentialV2 } from '@/app/organizer/credential-v2-actions';

describe('V2 server session boundary', () => {
  beforeEach(() => vi.resetAllMocks());
  it('uses the validated server actor even when input attempts to supply another actor', async () => {
    const trusted = createTestActor({ role: 'operator', issuerEntityIds: ['issuer'] });
    mocks.session.mockResolvedValue(trusted);
    const untrusted = { issuerEntityId: 'issuer', actor: createTestActor() };
    await issueCredentialV2(untrusted as never);
    expect(mocks.issue).toHaveBeenCalledWith({ ...untrusted, actor: trusted });
  });
  it('does not issue or revoke when no valid session is available', async () => {
    mocks.session.mockRejectedValue(new Error('session required'));
    await expect(issueCredentialV2({} as never)).rejects.toThrow('session required');
    await expect(revokeCredentialV2('test-id')).rejects.toThrow('session required');
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
});
