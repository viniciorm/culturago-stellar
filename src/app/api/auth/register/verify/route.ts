import { NextResponse } from 'next/server';
import { createAuthBundle } from '@/infrastructure/auth/factory';
import { isDomainError } from '@/domain/errors';

export async function POST(request: Request) {
  try {
    const { accountId, response } = await request.json();
    const bundle = createAuthBundle();
    const passkey = await bundle.passkeys.finishRegistration(accountId, response);
    return NextResponse.json({ credentialId: passkey.credentialId });
  } catch (error) {
    const status = isDomainError(error) ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'internal error' },
      { status }
    );
  }
}
