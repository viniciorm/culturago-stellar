'use server';

import { requireActorFromSession } from '@/infrastructure/auth/getActorFromSession';
import {
  CredentialV2Service,
  type CredentialV2Record,
  type IssueCredentialV2Params,
} from '@/infrastructure/credentials/v2/CredentialV2Service';
import {
  SimulatedCredentialV2Gateway,
  type SimulatedV2GatewayResult,
} from '@/infrastructure/credentials/v2/SimulatedCredentialV2Gateway';

/** Off-chain V2 entry with session-derived operator context. */
export async function issueCredentialV2(input: Omit<IssueCredentialV2Params, 'actor'>) {
  const actor = await requireActorFromSession();
  return new CredentialV2Service().issueCredential({ ...input, actor });
}

/**
 * D1 vertical checkpoint entry: derives the operator actor from the validated
 * server session, persists the V2 credential after verifying operator scope and
 * participation evidence, and runs the explicitly labeled simulated V2 gateway
 * (`simulated: true`, `onChainConfirmed: false`). Real Testnet anchoring is D2.
 */
export async function issueCredentialV2WithSimulatedGateway(
  input: Omit<IssueCredentialV2Params, 'actor'>
): Promise<{
  credential: CredentialV2Record;
  gateway: SimulatedV2GatewayResult;
}> {
  const actor = await requireActorFromSession();
  const credential = await new CredentialV2Service().issueCredential({
    ...input,
    actor,
  });
  const gateway = new SimulatedCredentialV2Gateway().simulateIssue(credential, {
    operatorAddress: actor.walletAddress ?? `simulated-operator:${actor.accountId}`,
  });
  return { credential, gateway };
}

export async function revokeCredentialV2(publicId: string) {
  const actor = await requireActorFromSession();
  return new CredentialV2Service().revokeCredential(publicId, actor);
}
