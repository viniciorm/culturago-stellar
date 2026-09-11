import { NextResponse } from 'next/server';
import { getActorFromSession } from '@/infrastructure/auth/getActorFromSession';
import { query } from '@/infrastructure/database/pool';

export async function GET() {
  try {
    const actor = await getActorFromSession();
    if (!actor) {
      return NextResponse.json({ authenticated: false, redirectTo: '/login' }, { status: 401 });
    }

    if (actor.role === 'admin') {
      return NextResponse.json({
        authenticated: true,
        role: actor.role,
        redirectTo: '/dashboard',
      });
    }

    // For non-admin users (staff, organizers, dancers, schools)
    // Prioritize credentials for FDVC 2026 event
    if (actor.personEntityId) {
      const eventRes = await query<{ id: string }>(
        `SELECT id FROM entities WHERE slug = 'fdvc-2026' AND kind = 'event' LIMIT 1`
      );
      const fdvcEventId = eventRes.rows[0]?.id;

      const res = await query<{ credential_code: string }>(
        `SELECT credential_code FROM credentials
         WHERE (
           subject_entity_id = $1
           OR subject_entity_id IN (
             SELECT to_entity_id FROM relationships WHERE from_entity_id = $1
           )
         )
         AND (
           ($2::uuid IS NOT NULL AND event_id = $2::uuid)
           OR credential_code LIKE 'FDVC2026-%'
         )
         ORDER BY created_at DESC
         LIMIT 1`,
        [actor.personEntityId, fdvcEventId || null]
      );

      if (res.rows[0]?.credential_code) {
        return NextResponse.json({
          authenticated: true,
          role: actor.role,
          redirectTo: `/credencial/${res.rows[0].credential_code}`,
        });
      }
    }

    return NextResponse.json({
      authenticated: true,
      role: actor.role,
      redirectTo: '/',
    });
  } catch (error) {
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
