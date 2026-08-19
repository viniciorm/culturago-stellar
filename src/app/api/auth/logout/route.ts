import { NextResponse } from 'next/server';
import { createAuthBundle } from '@/infrastructure/auth/factory';

export async function POST(request: Request) {
  const token = request.headers.get('cookie')?.match(/culturago_session=([^;]+)/)?.[1];
  const bundle = createAuthBundle();
  if (token) {
    await bundle.sessions.revoke(decodeURIComponent(token));
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set('culturago_session', '', { maxAge: 0, path: '/' });
  return res;
}
