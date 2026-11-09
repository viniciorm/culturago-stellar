'use server';

import { requireActorFromSession } from '@/infrastructure/auth/getActorFromSession';
import { CredentialV2Service, type IssueCredentialV2Params } from '@/infrastructure/credentials/v2/CredentialV2Service';

/** Off-chain V2 entry only; UI and Soroban orchestration are separate work. */
export async function issueCredentialV2(input: Omit<IssueCredentialV2Params, 'actor'>) {
  const actor = await requireActorFromSession();
  return new CredentialV2Service().issueCredential({ ...input, actor });
}

export async function revokeCredentialV2(publicId: string) {
  const actor = await requireActorFromSession();
  return new CredentialV2Service().revokeCredential(publicId, actor);
}
