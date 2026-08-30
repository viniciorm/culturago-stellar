import { NextResponse } from 'next/server';
import { ClaimService } from '@/infrastructure/auth/ClaimService';
import { createAuthBundle } from '@/infrastructure/auth/factory';
import { isDomainError } from '@/domain/errors';

const SESSION_COOKIE_NAME = 'culturago_session';
const SESSION_IDLE_SECONDS = 15 * 60;

export async function POST(request: Request) {
  try {
    const { code } = await request.json();
    const { store, sessions } = createAuthBundle();
    const service = new ClaimService(store);
    const accountId = await service.claimAccount(code);

    // Convert the one-time claim into a short-lived session so the new account
    // can register its first passkey without being able to add keys to other accounts.
    const session = await sessions.create(accountId);

    const res = NextResponse.json({ accountId });
    res.cookies.set(SESSION_COOKIE_NAME, session.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_IDLE_SECONDS,
    });
    return res;
  } catch (error) {
    const status = isDomainError(error) ? 400 : 500;
    // Return a generic message for all domain errors to prevent enumeration of
    // account existence, account status or challenge consumption state.
    return NextResponse.json(
      { error: status === 400 ? 'invalid or expired claim code' : 'internal error' },
      { status }
    );
  }
}
