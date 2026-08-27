import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

function loadEnv(path) {
  try {
    const raw = readFileSync(path, 'utf8');
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (env[key] === undefined) env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}

const env = loadEnv(envPath);
const address = process.argv[2] || env.STELLAR_TESTNET_ADMIN_ADDRESS;

if (!address) {
  console.error('Falta la dirección a fondear.');
  console.error('Usos:');
  console.error('  node scripts/fund-testnet.mjs');
  console.error('  node scripts/fund-testnet.mjs G...');
  process.exit(1);
}

if (!address.startsWith('G')) {
  console.error(`La dirección ${address} no parece una cuenta clásica (no empieza con G).`);
  console.error('Friendbot solo fondea cuentas. Las smart wallets (C...) no necesitan XLM; el fee payer paga las fees.');
  process.exit(1);
}

const url = `https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`;
console.log(`Fondeando ${address}...`);

try {
  const res = await fetch(url, { method: 'POST' });
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  try {
    const json = JSON.parse(text);
    console.log('Respuesta:', JSON.stringify(json, null, 2));
  } catch {
    console.log('Respuesta:', text);
  }
  if (!res.ok) {
    console.error('Friendbot no pudo fondear. Probablemente ya esté fondeada o la dirección es inválida.');
    process.exit(1);
  }
} catch (err) {
  console.error('Error llamando a Friendbot:', err instanceof Error ? err.message : err);
  process.exit(1);
}
