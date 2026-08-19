import { NextResponse } from 'next/server';
import { ClaimService } from '@/infrastructure/auth/ClaimService';
import { PostgreSQLIdentityStore } from '@/infrastructure/auth/PostgreSQLIdentityStore';
import { isDomainError } from '@/domain/errors';

export async function POST(request: Request) {
  try {
    const { code } = await request.json();
    const service = new ClaimService(new PostgreSQLIdentityStore());
    const accountId = await service.claimAccount(code);
    return NextResponse.json({ accountId });
  } catch (error) {
    const status = isDomainError(error) ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'internal error' },
      { status }
    );
  }
}
