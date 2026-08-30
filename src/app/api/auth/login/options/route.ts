import { NextResponse } from 'next/server';
import { createAuthBundle } from '@/infrastructure/auth/factory';
import { isDomainError } from '@/domain/errors';

export async function POST(request: Request) {
  try {
    const { accountId } = await request.json();
    const bundle = createAuthBundle();
    const options = await bundle.passkeys.startAuthentication(accountId);
    return NextResponse.json(options);
  } catch (error) {
    const status = isDomainError(error) ? 400 : 500;
    // Generic message prevents distinguishing account existence from missing passkeys.
    return NextResponse.json(
      { error: status === 400 ? 'invalid authentication request' : 'internal error' },
      { status }
    );
  }
}
