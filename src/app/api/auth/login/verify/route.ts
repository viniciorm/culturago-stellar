import { NextResponse } from 'next/server';
import { createAuthBundle } from '@/infrastructure/auth/factory';
import { isDomainError } from '@/domain/errors';

export async function POST(request: Request) {
  try {
    const { response } = await request.json();
    const bundle = createAuthBundle();
    const accountId = await bundle.passkeys.finishAuthentication(response);
    const session = await bundle.sessions.create(accountId);

    const res = NextResponse.json({ accountId });
    res.cookies.set('culturago_session', session.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60,
    });
    return res;
  } catch (error) {
    const status = isDomainError(error) ? 400 : 500;
    // Generic message prevents distinguishing unknown credentials from stale challenges.
    return NextResponse.json(
      { error: status === 400 ? 'invalid authentication response' : 'internal error' },
      { status }
    );
  }
}
