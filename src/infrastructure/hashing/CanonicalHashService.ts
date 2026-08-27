import { CanonicalHashPort } from '../../ports/CanonicalHashPort';
import { createCanonicalHashPort } from './canonicalHash';
import { sha256Node } from './sha256Node';

/**
 * Default CanonicalHashPort for the server. Uses canonicalizeJson (JCS profile)
 * and node:crypto SHA-256 so it matches the browser/CLI ports and the
 * golden-vector fixtures.
 */
export class CanonicalHashService implements CanonicalHashPort {
  private readonly port = createCanonicalHashPort(sha256Node);

  canonicalize(...args: Parameters<CanonicalHashPort['canonicalize']>): ReturnType<CanonicalHashPort['canonicalize']> {
    return this.port.canonicalize(...args);
  }

  hashDocument(...args: Parameters<CanonicalHashPort['hashDocument']>): ReturnType<CanonicalHashPort['hashDocument']> {
    return this.port.hashDocument(...args);
  }
}
