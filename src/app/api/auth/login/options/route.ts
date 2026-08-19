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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'internal error' },
      { status }
    );
  }
}
