import { domainError } from '../../domain/errors';

/**
 * WebCrypto SHA-256 (browser and any runtime exposing crypto.subtle).
 * Throws on failure: silent fallbacks are forbidden.
 */
export async function sha256Web(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw domainError('INVALID_INPUT', 'WebCrypto subtle API is not available in this runtime');
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
