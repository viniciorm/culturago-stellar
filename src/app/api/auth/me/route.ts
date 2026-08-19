import { NextResponse } from 'next/server';
import { createAuthBundle } from '@/infrastructure/auth/factory';
import { resolveActor } from '@/infrastructure/auth/resolveActor';

export async function GET(request: Request) {
  const token = request.headers.get('cookie')?.match(/culturago_session=([^;]+)/)?.[1];
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const bundle = createAuthBundle();
  const session = await bundle.sessions.validate(decodeURIComponent(token));
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const actor = await resolveActor(bundle.store, session.accountId);
  return NextResponse.json({
    accountId: actor.accountId,
    role: actor.role,
    issuerEntityIds: actor.issuerEntityIds,
    personEntityId: actor.personEntityId,
  });
}
