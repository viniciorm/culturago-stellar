import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Recomputes the golden vectors frozen in tests/infrastructure/canonical-hash.test.ts.
// Run: node scripts/compute-golden-vectors.mjs
const h = (bytes) => createHash('sha256').update(bytes).digest('hex');
const digest = (schema, canonical) => {
  const input = new TextEncoder().encode(`CULTURAGO\0${schema}\0${canonical}`);
  return { input: Buffer.from(input).toString('hex'), hash: h(input) };
};

const vectors = [
  { name: 'v1', schema: 'culturago.entity.v1', doc: { b: 1, a: 'hola' }, canonical: '{"a":"hola","b":1}' },
  { name: 'v2', schema: 'culturago.credential.v1', doc: {}, canonical: '{}' },
  { name: 'v3', schema: 'culturago.entity.v1', doc: { arr: [3, 2, 1], nested: { z: true, y: null } }, canonical: '{"arr":[3,2,1],"nested":{"y":null,"z":true}}' },
];

const out = {
  version: 1,
  algorithm: 'sha256',
  encoding: 'hex',
  digestPrefix: 'CULTURAGO\\0<schema>\\0<canonical-json>',
  generatedAt: new Date().toISOString(),
  vectors: vectors.map(({ name, schema, doc, canonical }) => {
    const { input, hash } = digest(schema, canonical);
    return { name, schema, doc, canonical, digestInputHex: input, expectedSha256: hash };
  }),
};

const root = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(root, '..', 'fixtures');
mkdirSync(fixturesDir, { recursive: true });
const path = join(fixturesDir, 'golden-vectors.json');
writeFileSync(path, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${path}`);
for (const v of out.vectors) {
  console.log(`${v.name}: ${v.expectedSha256}`);
}
