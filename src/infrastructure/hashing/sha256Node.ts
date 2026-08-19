import { createHash } from 'node:crypto';

/** Node.js SHA-256 for Server Actions, workers and CLI tooling. */
export async function sha256Node(bytes: Uint8Array): Promise<string> {
  return createHash('sha256').update(bytes).digest('hex');
}
