import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import {
  assertOriginAllowed,
  assertRateLimit,
  parseStrictJson,
  validateDeployBody,
  validatePrepareCommand,
  validateSubmitBody,
} from '@/infrastructure/perimeter/perimeter';
import { isDomainError } from '@/domain/errors';

const makeAddress = () => Keypair.random().publicKey();
const makeContractId = () => StrKey.encodeContract(Buffer.alloc(32, 0));

const hex = (byte: number) => byte.toString(16).padStart(2, '0').repeat(32);
const uuid = '11111111-1111-1111-1111-111111111111';

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/api/sign/submit', {
    method: 'POST',
    headers,
  });
}

describe('perimeter', () => {
  beforeAll(() => {
    process.env.CULTURAGO_TRUSTED_ORIGINS = 'http://localhost:3000';
  });

  afterAll(() => {
    delete process.env.CULTURAGO_TRUSTED_ORIGINS;
  });

  it('accepts matching origin and host', () => {
    const request = requestWithHeaders({
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    });
    expect(() => assertOriginAllowed(request)).not.toThrow();
  });

  it('accepts referer when origin is absent', () => {
    const request = requestWithHeaders({
      referer: 'http://localhost:3000/organizer',
      host: 'localhost:3000',
    });
    expect(() => assertOriginAllowed(request)).not.toThrow();
  });

  it('rejects missing origin and referer', () => {
    const request = requestWithHeaders({ host: 'localhost:3000' });
    expect(() => assertOriginAllowed(request)).toThrow(/origin or referer/);
  });

  it('rejects cross-origin request', () => {
    const request = requestWithHeaders({
      origin: 'http://evil.example',
      host: 'localhost:3000',
    });
    expect(() => assertOriginAllowed(request)).toThrow(/origin not in allowlist/);
  });

  it('rejects malformed origin header', () => {
    const request = requestWithHeaders({
      origin: 'not-a-url',
      host: 'localhost:3000',
    });
    expect(() => assertOriginAllowed(request)).toThrow(/invalid origin/);
  });

  it('rejects oversized body', async () => {
    const request = new Request('http://localhost:3000/api/sign/submit', {
      method: 'POST',
      body: JSON.stringify({ x: 'x'.repeat(128 * 1024) }),
    });
    await expect(parseStrictJson(request, 64 * 1024)).rejects.toSatisfy((e) =>
      isDomainError(e, 'INVALID_INPUT')
    );
  });

  it('rejects non-JSON body', async () => {
    const request = new Request('http://localhost:3000/api/sign/submit', {
      method: 'POST',
      body: 'not json',
    });
    await expect(parseStrictJson(request)).rejects.toSatisfy((e) =>
      isDomainError(e, 'INVALID_INPUT')
    );
  });

  it('enforces rate limit per key', async () => {
    const key = 'actor-1';
    for (let i = 0; i < 5; i += 1) {
      await assertRateLimit(key, { limit: 5, windowMs: 60_000 });
    }
    await expect(assertRateLimit(key, { limit: 5, windowMs: 60_000 })).rejects.toThrow();
  });
});

describe('validatePrepareCommand', () => {
  it('accepts a valid register_entity command', () => {
    const actor = makeAddress();
    const command = validatePrepareCommand(
      {
        kind: 'register_entity',
        idempotencyKey: uuid,
        entityId: uuid,
        metadataHash: hex(1),
        hashSchema: 1,
      },
      actor
    );
    expect(command).toMatchObject({
      kind: 'register_entity',
      actorAddress: actor,
      hashSchema: 1,
    });
  });

  it('rejects client-supplied actorAddress', () => {
    expect(() =>
      validatePrepareCommand(
        {
          kind: 'register_entity',
          idempotencyKey: uuid,
          actorAddress: makeAddress(),
          entityId: uuid,
          metadataHash: hex(1),
          hashSchema: 1,
        },
        makeAddress()
      )
    ).toThrow(/actorAddress must not be supplied by client/);
  });

  it('rejects unknown fields', () => {
    expect(() =>
      validatePrepareCommand(
        {
          kind: 'issue_credential',
          idempotencyKey: uuid,
          credentialId: uuid,
          issuerId: uuid,
          subjectId: uuid,
          eventId: uuid,
          credentialType: 1,
          metadataHash: hex(1),
          hashSchema: 1,
          evil: true,
        },
        makeAddress()
      )
    ).toThrow(/unknown fields: evil/);
  });

  it('rejects invalid credential type', () => {
    expect(() =>
      validatePrepareCommand(
        {
          kind: 'issue_credential',
          idempotencyKey: uuid,
          credentialId: uuid,
          issuerId: uuid,
          subjectId: uuid,
          eventId: uuid,
          credentialType: 99,
          metadataHash: hex(1),
          hashSchema: 1,
        },
        makeAddress()
      )
    ).toThrow(/credentialType/);
  });

  it('rejects non-hex metadata hash', () => {
    expect(() =>
      validatePrepareCommand(
        {
          kind: 'register_entity',
          idempotencyKey: uuid,
          entityId: uuid,
          metadataHash: 'not-hex',
          hashSchema: 1,
        },
        makeAddress()
      )
    ).toThrow(/metadataHash/);
  });

  it('rejects non-UUID entity id', () => {
    expect(() =>
      validatePrepareCommand(
        {
          kind: 'register_entity',
          idempotencyKey: uuid,
          entityId: 'not-uuid',
          metadataHash: hex(1),
          hashSchema: 1,
        },
        makeAddress()
      )
    ).toThrow(/entityId/);
  });
});

describe('validateSubmitBody', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    originalEnv.NEXT_PUBLIC_CULTURAGO_ENV = process.env.NEXT_PUBLIC_CULTURAGO_ENV;
    originalEnv.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE;
    originalEnv.NEXT_PUBLIC_STELLAR_RPC_URL = process.env.NEXT_PUBLIC_STELLAR_RPC_URL;
    process.env.NEXT_PUBLIC_CULTURAGO_ENV = 'testnet';
    process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
    process.env.NEXT_PUBLIC_STELLAR_RPC_URL = 'https://soroban-testnet.stellar.org';
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_CULTURAGO_ENV = originalEnv.NEXT_PUBLIC_CULTURAGO_ENV;
    process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE = originalEnv.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE;
    process.env.NEXT_PUBLIC_STELLAR_RPC_URL = originalEnv.NEXT_PUBLIC_STELLAR_RPC_URL;
  });

  const valid = {
    operationId: uuid,
    signedXdr: Buffer.from('xdr-payload').toString('base64'),
    signerAddress: makeAddress(),
  };

  it('accepts a valid submit body', () => {
    expect(validateSubmitBody(valid)).toEqual(valid);
  });

  it('rejects extra fields', () => {
    expect(() => validateSubmitBody({ ...valid, extra: 1 })).toThrow(/unknown fields/);
  });

  it('rejects invalid operation id', () => {
    expect(() => validateSubmitBody({ ...valid, operationId: 'not-uuid' })).toThrow(/operationId/);
  });

  it('rejects non-base64 signedXdr', () => {
    expect(() =>
      validateSubmitBody({ ...valid, signedXdr: '!!!' })
    ).toThrow(/signedXdr/);
  });

  it('rejects invalid signer address', () => {
    expect(() =>
      validateSubmitBody({ ...valid, signerAddress: 'G_INVALID' })
    ).toThrow(/signerAddress/);
  });
});

describe('validateDeployBody', () => {
  const valid = {
    signedTx: Buffer.from('tx-xdr').toString('base64'),
    contractId: makeContractId(),
  };

  it('accepts a valid deploy body', () => {
    expect(validateDeployBody(valid)).toEqual({
      ...valid,
      keyId: null,
      walletWasmHash: null,
    });
  });

  it('accepts optional keyId and walletWasmHash', () => {
    const withOptional = {
      ...valid,
      keyId: 'test-key-id',
      walletWasmHash: 'fdefad64b96837147e1c333e51f537b696eab925e9f147e63d597c04e3c903f0',
    };
    expect(validateDeployBody(withOptional)).toEqual(withOptional);
  });

  it('rejects extra fields', () => {
    expect(() => validateDeployBody({ ...valid, extra: true })).toThrow(/unknown fields/);
  });

  it('rejects invalid contract id', () => {
    expect(() =>
      validateDeployBody({ ...valid, contractId: 'G_NOT_A_CONTRACT' })
    ).toThrow(/contractId/);
  });

  it('rejects non-base64 signedTx', () => {
    expect(() =>
      validateDeployBody({ ...valid, signedTx: '!!!' })
    ).toThrow(/signedTx/);
  });
});
