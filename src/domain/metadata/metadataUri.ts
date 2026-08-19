import { domainError } from '../errors';

/**
 * Stable metadata identifiers. These URIs never change with versions or
 * infrastructure: the version lives in the entity history, not in the URI.
 */
const URI_PATTERN = /^culturago:(entity|credential):v1:[0-9a-f-]{36}$/;

function build(kind: 'entity' | 'credential', id: string): string {
  const uri = `culturago:${kind}:v1:${id.toLowerCase()}`;
  if (!URI_PATTERN.test(uri)) {
    throw domainError('INVALID_INPUT', `Invalid ${kind} id for metadata URI: ${id}`);
  }
  return uri;
}

export function buildEntityMetadataUri(entityId: string): string {
  return build('entity', entityId);
}

export function buildCredentialMetadataUri(credentialId: string): string {
  return build('credential', credentialId);
}
