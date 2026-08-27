import 'server-only';
import { domainError } from '../../domain/errors';
import { ActorContext } from '../auth/actorContext';
import { requireActorFromSession } from '../auth/getActorFromSession';
import {
  IssueCredentialCommand,
  RegisterEntityCommand,
  RevokeCredentialCommand,
} from '../../ports/StellarGateway';
import { assertTestnetHarnessAllowed } from '../stellar/harnessGuard';

export interface SubmitBody {
  operationId: string;
  signedXdr: string;
  signerAddress: string;
}

export interface DeployBody {
  signedTx: string;
  contractId: string;
}

interface PreparedRegisterEntity extends RegisterEntityCommand {
  kind: 'register_entity';
}

interface PreparedIssueCredential extends IssueCredentialCommand {
  kind: 'issue_credential';
}

interface PreparedRevokeCredential extends RevokeCredentialCommand {
  kind: 'revoke_credential';
}

type PreparedCommand =
  | PreparedRegisterEntity
  | PreparedIssueCredential
  | PreparedRevokeCredential;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_64_RE = /^[0-9a-f]{64}$/i;
const STELLAR_ADDRESS_RE = /^[GC][A-Z2-7]{55}$/;
const CONTRACT_ID_RE = /^C[A-Z2-7]{55}$/;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export const HARNESS_MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_RATE_LIMIT = 120;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_RELAYER_WINDOW_MS = 24 * 60 * 60 * 1000;

function readPositiveInt(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (Number.isNaN(value) || value < 1) {
    throw domainError('INVALID_INPUT', `${key} must be a positive integer`);
  }
  return value;
}

function defaultRelayerBudget(): number {
  return readPositiveInt('STELLAR_RELAYER_DAILY_BUDGET', 500);
}

function defaultRateLimit(): number {
  return readPositiveInt('STELLAR_HARNESS_RATE_LIMIT', DEFAULT_RATE_LIMIT);
}

interface LimitEntry {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, LimitEntry>();
const relayerBudgets = new Map<string, LimitEntry>();

function hitLimit(
  store: Map<string, LimitEntry>,
  key: string,
  limit: number,
  windowMs: number
): void {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (entry.count >= limit) {
    throw domainError('RATE_LIMITED', 'limit exceeded');
  }
  entry.count += 1;
}

export function assertRateLimit(
  key: string,
  options?: { limit?: number; windowMs?: number }
): void {
  hitLimit(
    rateLimits,
    key,
    options?.limit ?? defaultRateLimit(),
    options?.windowMs ?? DEFAULT_RATE_WINDOW_MS
  );
}

export function assertRelayerBudget(
  key: string,
  options?: { limit?: number; windowMs?: number }
): void {
  hitLimit(
    relayerBudgets,
    key,
    options?.limit ?? defaultRelayerBudget(),
    options?.windowMs ?? DEFAULT_RELAYER_WINDOW_MS
  );
}

/**
 * Validate the Origin or Referer header matches the request Host.
 * This is a server-side same-origin/CSRF check for harness mutations.
 */
export function assertOriginAllowed(request: Request): void {
  const originHeader = request.headers.get('origin');
  const refererHeader = request.headers.get('referer');
  const origin = originHeader ?? refererHeader;

  if (!origin) {
    throw domainError('UNAUTHORIZED', 'origin or referer header required');
  }

  let originHost: string;
  try {
    originHost = new URL(origin).hostname;
  } catch {
    throw domainError('UNAUTHORIZED', 'invalid origin header');
  }

  const host = request.headers.get('host')?.split(':')[0];
  if (!host || originHost !== host) {
    throw domainError('UNAUTHORIZED', 'origin does not match request host');
  }
}

/**
 * Reject bodies larger than the allowed byte budget.
 */
export function assertBodySize(
  text: string,
  maxBytes: number = HARNESS_MAX_BODY_BYTES
): void {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > maxBytes) {
    throw domainError('INVALID_INPUT', `body exceeds ${maxBytes} bytes`);
  }
}

/**
 * Read the request body as text, check the size, parse JSON and return both.
 * Throws on invalid JSON, empty body or oversized payload.
 */
export async function parseStrictJson(
  request: Request,
  maxBytes: number = HARNESS_MAX_BODY_BYTES
): Promise<{ text: string; parsed: unknown }> {
  const text = await request.text();
  if (!text || text.trim().length === 0) {
    throw domainError('INVALID_INPUT', 'body is empty');
  }
  assertBodySize(text, maxBytes);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw domainError('INVALID_INPUT', 'body is not valid JSON');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw domainError('INVALID_INPUT', 'body must be a JSON object');
  }

  return { text, parsed };
}

function assertNoExtraFields(obj: Record<string, unknown>, allowed: Set<string>): void {
  const extra = Object.keys(obj).filter((k) => !allowed.has(k));
  if (extra.length > 0) {
    throw domainError('INVALID_INPUT', `unknown fields: ${extra.join(', ')}`);
  }
}

function assertUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw domainError('INVALID_INPUT', `${field} must be a UUID`);
  }
  return value.toLowerCase();
}

function assertHex32(value: unknown, field: string): string {
  if (typeof value !== 'string' || !HEX_64_RE.test(value)) {
    throw domainError('INVALID_INPUT', `${field} must be a 64-char lowercase hex digest`);
  }
  return value.toLowerCase();
}

function assertOptionalHex32(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !HEX_64_RE.test(value)) {
    throw domainError('INVALID_INPUT', `${field} must be null or a 64-char lowercase hex digest`);
  }
  return value.toLowerCase();
}

function assertStellarAddress(value: unknown, field: string): string {
  if (typeof value !== 'string' || !STELLAR_ADDRESS_RE.test(value)) {
    throw domainError('INVALID_INPUT', `${field} must be a Stellar address`);
  }
  return value;
}

function assertBase64(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw domainError('INVALID_INPUT', `${field} must be a non-empty string`);
  }
  if (!BASE64_RE.test(value) || value.length % 4 !== 0) {
    throw domainError('INVALID_INPUT', `${field} must be a valid base64 string`);
  }
  return value;
}

function assertContractId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !CONTRACT_ID_RE.test(value)) {
    throw domainError('INVALID_INPUT', `${field} must be a Stellar contract address`);
  }
  return value;
}

/**
 * Validate a /api/sign/prepare command.
 * The actorAddress is always derived server-side from the session.
 */
export function validatePrepareCommand(
  raw: unknown,
  actorAddress: string
): PreparedCommand {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw domainError('INVALID_INPUT', 'body must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;

  if ('actorAddress' in obj) {
    throw domainError('INVALID_INPUT', 'actorAddress must not be supplied by client');
  }

  if (typeof obj.kind !== 'string') {
    throw domainError('INVALID_INPUT', 'kind is required');
  }

  switch (obj.kind) {
    case 'register_entity': {
      assertNoExtraFields(obj, new Set(['kind', 'idempotencyKey', 'entityId', 'metadataHash', 'hashSchema']));
      return {
        kind: 'register_entity',
        idempotencyKey: assertUuid(obj.idempotencyKey, 'idempotencyKey'),
        actorAddress,
        entityId: assertUuid(obj.entityId, 'entityId'),
        metadataHash: assertHex32(obj.metadataHash, 'metadataHash'),
        hashSchema: 1,
      };
    }
    case 'issue_credential': {
      assertNoExtraFields(
        obj,
        new Set([
          'kind',
          'idempotencyKey',
          'credentialId',
          'issuerId',
          'subjectId',
          'eventId',
          'credentialType',
          'metadataHash',
          'hashSchema',
        ])
      );
      if (typeof obj.credentialType !== 'number' || obj.credentialType < 1 || obj.credentialType > 6) {
        throw domainError('INVALID_INPUT', 'credentialType must be an integer between 1 and 6');
      }
      if (typeof obj.hashSchema !== 'number' || obj.hashSchema !== 1) {
        throw domainError('INVALID_INPUT', 'hashSchema must be 1');
      }
      return {
        kind: 'issue_credential',
        idempotencyKey: assertUuid(obj.idempotencyKey, 'idempotencyKey'),
        actorAddress,
        credentialId: assertUuid(obj.credentialId, 'credentialId'),
        issuerId: assertUuid(obj.issuerId, 'issuerId'),
        subjectId: assertUuid(obj.subjectId, 'subjectId'),
        eventId: assertUuid(obj.eventId, 'eventId'),
        credentialType: Math.floor(obj.credentialType),
        metadataHash: assertHex32(obj.metadataHash, 'metadataHash'),
        hashSchema: 1,
      };
    }
    case 'revoke_credential': {
      assertNoExtraFields(obj, new Set(['kind', 'idempotencyKey', 'credentialId', 'reasonHash']));
      return {
        kind: 'revoke_credential',
        idempotencyKey: assertUuid(obj.idempotencyKey, 'idempotencyKey'),
        actorAddress,
        credentialId: assertUuid(obj.credentialId, 'credentialId'),
        reasonHash: assertOptionalHex32(obj.reasonHash, 'reasonHash'),
      };
    }
    default:
      throw domainError('INVALID_INPUT', `unknown operation kind: ${obj.kind}`);
  }
}

/**
 * Validate a /api/sign/submit body.
 */
export function validateSubmitBody(raw: unknown): SubmitBody {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw domainError('INVALID_INPUT', 'body must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  assertNoExtraFields(obj, new Set(['operationId', 'signedXdr', 'signerAddress']));

  return {
    operationId: assertUuid(obj.operationId, 'operationId'),
    signedXdr: assertBase64(obj.signedXdr, 'signedXdr'),
    signerAddress: assertStellarAddress(obj.signerAddress, 'signerAddress'),
  };
}

/**
 * Validate a /api/smart-wallet/deploy body.
 */
export function validateDeployBody(raw: unknown): DeployBody {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw domainError('INVALID_INPUT', 'body must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  assertNoExtraFields(obj, new Set(['signedTx', 'contractId']));

  return {
    signedTx: assertBase64(obj.signedTx, 'signedTx'),
    contractId: assertContractId(obj.contractId, 'contractId'),
  };
}

/**
 * Full harness perimeter check. Requires:
 *  - Testnet environment, manifest match and kill switch.
 *  - Origin/Referer same-origin check.
 *  - Valid session with an on-chain wallet.
 *  - Optional: internal harness token if tokenEnvVar is configured.
 */
export async function requireHarnessActor(
  request: Request,
  options: {
    tokenEnvVar?: 'CULTURAGO_TESTNET_HARNESS_TOKEN' | 'CULTURAGO_TESTNET_ADMIN_TOKEN';
    tokenHeader?: string;
  } = {}
): Promise<ActorContext> {
  await assertTestnetHarnessAllowed(request, options);
  assertOriginAllowed(request);
  const actor = await requireActorFromSession();
  if (!actor.walletAddress) {
    throw domainError('UNAUTHORIZED', 'actor has no on-chain wallet configured');
  }

  const key = actor.accountId ?? actor.walletAddress;
  assertRateLimit(key);

  return actor;
}
