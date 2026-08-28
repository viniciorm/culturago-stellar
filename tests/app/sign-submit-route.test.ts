import { createHash } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { POST } = await import('@/app/api/sign/submit/route');
const { createStellarGateway } = await import('@/infrastructure/stellar/createStellarGateway');

describe('POST /api/sign/submit', () => {
  const originalEnv = process.env.NEXT_PUBLIC_CULTURAGO_ENV;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_CULTURAGO_ENV = 'demo';
  });

  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_CULTURAGO_ENV;
    } else {
      process.env.NEXT_PUBLIC_CULTURAGO_ENV = originalEnv;
    }
  });

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function signDemoXdr(unsignedXdr: string): string {
  const envelope = JSON.parse(unsignedXdr) as { mode?: string; signature?: string | null };
  envelope.mode = 'signed';
  envelope.signature = 'client-sig';
  return JSON.stringify(envelope);
}

function buildRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/sign/submit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    },
    body: JSON.stringify(body),
  });
}

  it('confirms a register_entity operation in demo', async () => {
    const entityId = crypto.randomUUID();
    const metadataHash = sha256Hex('metadata');
    const actor = 'G_DEMO_ACTOR';

    const { gateway } = createStellarGateway();
    const operation = await gateway.prepareRegisterEntity({
      idempotencyKey: `register:${entityId}`,
      actorAddress: actor,
      entityId,
      metadataHash,
      hashSchema: 1,
    });

    const prepared = await gateway.getPreparedPayload(operation.operationId);
    const signedXdr = signDemoXdr(prepared.unsignedXdr);

    const request = buildRequest({
      operationId: operation.operationId,
      signedXdr,
      signerAddress: actor,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const json = (await response.json()) as { operation?: { phase: string } };
    expect(json.operation?.phase).toBe('confirmed');
  });

  it('rejects a mismatched signer address', async () => {
    const { gateway } = createStellarGateway();
    const entityId = crypto.randomUUID();
    const metadataHash = sha256Hex('metadata-mismatch');

    const operation = await gateway.prepareRegisterEntity({
      idempotencyKey: `register:${entityId}`,
      actorAddress: 'G_DEMO_ACTOR',
      entityId,
      metadataHash,
      hashSchema: 1,
    });

    const prepared = await gateway.getPreparedPayload(operation.operationId);
    const signedXdr = signDemoXdr(prepared.unsignedXdr);

    const request = buildRequest({
      operationId: operation.operationId,
      signedXdr,
      signerAddress: 'G_OTHER_ACTOR',
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
