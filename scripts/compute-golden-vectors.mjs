import { createHash } from 'node:crypto';

// Recomputes the golden vectors frozen in tests/infrastructure/canonical-hash.test.ts.
// Run: node scripts/compute-golden-vectors.mjs
const h = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const wrap = (schema, canonical) => `CULTURAGO\0${schema}\0${canonical}`;

const vectors = [
  ['v1', 'culturago.entity.v1', '{"a":"hola","b":1}'],
  ['v2', 'culturago.credential.v1', '{}'],
  ['v3', 'culturago.entity.v1', '{"arr":[3,2,1],"nested":{"y":null,"z":true}}'],
];

for (const [name, schema, canonical] of vectors) {
  console.log(`${name}: ${h(wrap(schema, canonical))}`);
}
