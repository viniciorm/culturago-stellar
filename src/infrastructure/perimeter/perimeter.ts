import 'server-only';
import { domainError } from '../../domain/errors';
import { getPublicConfig } from '../config/env';
import {
  IssueCredentialCommand,
  RegisterEntityCommand,
  RevokeCredentialCommand,
} from '../../ports/StellarGateway';
import { getRateBudgetStore } from './createRateBudgetStore';

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

export const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_RATE_LIMIT = 120;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_RELAYER_WINDOW_MS = 24 * 60 * 60 * 1000;

function readPositiveInt(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || Number.isNaN(value) || value < 1) {
    throw domainError('INVALID_INPUT', `${key} must be a positive integer`);
  }
  return value;
}

function defaultRelayerBudget(): number {
  return readPositiveInt('STELLAR_RELAYER_DAILY_BUDGET', 500);
}

function defaultRateLimit(): number {
  return readPositiveInt(
    'STELLAR_RATE_LIMIT',
    readPositiveInt('STELLAR_HARNESS_RATE_LIMIT', DEFAULT_RATE_LIMIT)
  );
}

function domainRateLimit(limit: number, result: { count: number }): void {
  if (result.count > limit) {
    throw domainError('RATE_LIMITED', 'limit exceeded');
  }
}

export async function assertRateLimit(
  key: string,
  options?: { limit?: number; windowMs?: number }
): Promise<void> {
  const limit = options?.limit ?? defaultRateLimit();
  const result = await getRateBudgetStore().hitLimit(
    key,
    'rate',
    limit,
    options?.windowMs ?? DEFAULT_RATE_WINDOW_MS
  );
  domainRateLimit(limit, result);
}

export async function assertRelayerBudget(
  key: string,
  options?: { limit?: number; windowMs?: number }
): Promise<void> {
  const limit = options?.limit ?? defaultRelayerBudget();
  const result = await getRateBudgetStore().hitLimit(
    key,
    'budget',
    limit,
    options?.windowMs ?? DEFAULT_RELAYER_WINDOW_MS
  );
  domainRateLimit(limit, result);
}

function normalizeOrigin(input: string): string {
  try {
    return new URL(input.trim()).origin.toLowerCase();
  } catch {
    return '';
  }
}

function getTrustedOrigins(): string[] {
  const raw = process.env.CULTURAGO_TRUSTED_ORIGINS?.trim() ?? '';
  return raw
    .split(',')
    .map((s) => normalizeOrigin(s))
    .filter((s) => s.length > 0);
}

/**
 * Validate the Origin or Referer header against a trusted-origins allowlist.
 *
 * Parses the full origin (scheme + host + port) and compares it against the
 * configured CULTURAGO_TRUSTED_ORIGINS list. If the allowlist is empty in a
 * production build, the check fails closed instead of falling back to the Host
 * header, which can be spoofed.
 */
export function assertOriginAllowed(request: Request): void {
  const originHeader = request.headers.get('origin');
  const refererHeader = request.headers.get('referer');

  let rawOrigin = originHeader ?? null;
  let parsed: URL | null = null;

  if (!rawOrigin && refererHeader) {
    try {
      parsed = new URL(refererHeader);
      rawOrigin = parsed.origin;
    } catch {
      throw domainError('UNAUTHORIZED', 'invalid referer header');
    }
  }

  if (!rawOrigin) {
    throw domainError('UNAUTHORIZED', 'origin or referer header required');
  }

  try {
    if (!parsed) {
      parsed = new URL(rawOrigin);
    }
  } catch {
    throw domainError('UNAUTHORIZED', 'invalid origin header');
  }

  const requestOrigin = parsed.origin.toLowerCase();
  const allowed = getTrustedOrigins();

  if (allowed.length > 0) {
    if (!allowed.includes(requestOrigin)) {
      throw domainError('UNAUTHORIZED', 'origin not in allowlist');
    }
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw domainError('UNAUTHORIZED', 'trusted origins not configured');
  }

  // Non-production fallback: same host only (not a production control).
  const host = request.headers.get('host')?.split(':')[0].toLowerCase();
  if (!host || parsed.hostname.toLowerCase() !== host) {
    throw domainError('UNAUTHORIZED', 'origin does not match request host');
  }
}

/**
 * Reject bodies larger than the allowed byte budget.
 */
export function assertBodySize(
  text: string,
  maxBytes: number = MAX_BODY_BYTES
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
  maxBytes: number = MAX_BODY_BYTES
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

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw domainError('INVALID_INPUT', `${field} must be a non-empty string`);
  }
  return value;
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
      if (typeof obj.credentialType !== 'number' || !Number.isInteger(obj.credentialType) || obj.credentialType < 1 || obj.credentialType > 6) {
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
        credentialType: obj.credentialType,
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

  const isDemo = getPublicConfig().environment === 'demo';

  return {
    operationId: assertUuid(obj.operationId, 'operationId'),
    signedXdr: isDemo ? assertString(obj.signedXdr, 'signedXdr') : assertBase64(obj.signedXdr, 'signedXdr'),
    signerAddress: isDemo ? assertString(obj.signerAddress, 'signerAddress') : assertStellarAddress(obj.signerAddress, 'signerAddress'),
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

