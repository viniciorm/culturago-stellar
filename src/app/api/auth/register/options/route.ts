import { NextResponse } from 'next/server';
import { createAuthBundle } from '@/infrastructure/auth/factory';
import { requireActorFromSession } from '@/infrastructure/auth/getActorFromSession';
import { domainError, isDomainError } from '@/domain/errors';

export async function POST(request: Request) {
  try {
    const { accountId, displayName } = await request.json();
    const actor = await requireActorFromSession();
    if (actor.accountId !== accountId) {
      throw domainError('UNAUTHORIZED', 'account does not match session');
    }

    const bundle = createAuthBundle();
    const options = await bundle.passkeys.startRegistration(accountId, displayName);
    return NextResponse.json(options);
  } catch (error) {
    const code = isDomainError(error) ? (error as { code: string }).code : undefined;
    const status = code === 'UNAUTHORIZED' ? 401 : isDomainError(error) ? 400 : 500;
    // Do not leak account existence, status or passkey state.
    const message = status === 400 ? 'invalid registration request' : status === 401 ? 'unauthorized' : 'internal error';
    return NextResponse.json({ error: message }, { status });
  }
}
