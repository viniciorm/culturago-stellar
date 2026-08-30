import { describe, expect, it } from 'vitest';
import { prepareEntityForStellar } from '@/app/dashboard/entities/actions';
import { isDomainError } from '@/domain/errors';
import { isPersistenceConfigured } from '@/infrastructure/config/env';

describe('dashboard/entities/actions', () => {
  it.skipIf(isPersistenceConfigured())('prepareEntityForStellar requires DATABASE_URL', async () => {
    await expect(prepareEntityForStellar('00000000-0000-0000-0000-000000000001')).rejects.toSatisfy(
      (e) => isDomainError(e, 'INTERNAL')
    );
  });
});
