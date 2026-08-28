import { NextResponse } from 'next/server';
import { createAuthBundle } from '@/infrastructure/auth/factory';
import { requireActorFromSession } from '@/infrastructure/auth/getActorFromSession';
import { domainError, isDomainError } from '@/domain/errors';

export async function POST(request: Request) {
  try {
    const { accountId, response } = await request.json();
    const actor = await requireActorFromSession();
    if (actor.accountId !== accountId) {
      throw domainError('UNAUTHORIZED', 'account does not match session');
    }

    const bundle = createAuthBundle();
    const passkey = await bundle.passkeys.finishRegistration(accountId, response);
    return NextResponse.json({ credentialId: passkey.credentialId });
  } catch (error) {
    const code = isDomainError(error) ? (error as { code: string }).code : undefined;
    const status = code === 'UNAUTHORIZED' ? 401 : isDomainError(error) ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'internal error' },
      { status }
    );
  }
}
