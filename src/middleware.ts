import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') ?? `corr-${globalThis.crypto.randomUUID()}`;
  const idempotencyKey = request.headers.get('idempotency-key') ?? undefined;

  const headers = new Headers(request.headers);
  headers.set('x-correlation-id', correlationId);
  if (idempotencyKey) {
    headers.set('idempotency-key', idempotencyKey);
  }

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('x-correlation-id', correlationId);
  if (idempotencyKey) {
    response.headers.set('idempotency-key', idempotencyKey);
  }
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
