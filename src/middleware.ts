import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { Logger } from './infrastructure/observability/Logger';

export function middleware(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') ?? `corr-${randomUUID()}`;
  const idempotencyKey = request.headers.get('idempotency-key') ?? undefined;

  Logger.setContext({
    correlationId,
    idempotencyKey,
    method: request.method,
    path: request.nextUrl.pathname,
  });

  const response = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  });
  response.headers.set('x-correlation-id', correlationId);
  if (idempotencyKey) {
    response.headers.set('idempotency-key', idempotencyKey);
  }
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
