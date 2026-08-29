import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair } from '@stellar/stellar-sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

function loadEnv(path) {
  try {
    const raw = readFileSync(path, 'utf8');
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        env.__lines = env.__lines || [];
        env.__lines.push(line);
        continue;
      }
      const eq = trimmed.indexOf('=');
      if (eq === -1) {
        env.__lines.push(line);
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
      env.__lines = env.__lines || [];
      env.__lines.push({ key, value, raw: line });
    }
    return env;
  } catch {
    return { __lines: [] };
  }
}

function saveEnv(path, env) {
  const lines = env.__lines.map((entry) => {
    if (typeof entry === 'string') return entry;
    if (env[entry.key] === entry.value) return entry.raw;
    const needsQuotes = /\s|[#"']/u.test(env[entry.key]);
    return `${entry.key}=${needsQuotes ? '"' + env[entry.key].replace(/"/g, '\\"') + '"' : env[entry.key]}`;
  });
  for (const [key, value] of Object.entries(env)) {
    if (key === '__lines' || lines.some((l) => typeof l === 'object' && l.key === key)) continue;
    const needsQuotes = /\s|[#"']/u.test(value);
    lines.push(`${key}=${needsQuotes ? '"' + value.replace(/"/g, '\\"') + '"' : value}`);
  }
  writeFileSync(path, lines.join('\n') + '\n');
}

async function friendbotFund(address) {
  const url = `https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`;
  const res = await fetch(url, { method: 'POST' });
  const text = await res.text();
  const alreadyFunded = text.includes('already exists') || text.includes('already funded to starting balance');
  if (!res.ok && !alreadyFunded) {
    throw new Error(`friendbot ${res.status}: ${text}`);
  }
  return res.ok || alreadyFunded;
}

const env = loadEnv(envPath);

// If admin secret is missing but admin address matches deployer, reuse deployer secret.
if (!env.STELLAR_TESTNET_ADMIN_SECRET) {
  if (!env.STELLAR_TESTNET_DEPLOYER_SECRET) {
    throw new Error('STELLAR_TESTNET_DEPLOYER_SECRET is required to derive admin secret');
  }
  const deployerKeypair = Keypair.fromSecret(env.STELLAR_TESTNET_DEPLOYER_SECRET);
  const deployerPublic = deployerKeypair.publicKey();
  if (env.STELLAR_TESTNET_ADMIN_ADDRESS && deployerPublic === env.STELLAR_TESTNET_ADMIN_ADDRESS) {
    env.STELLAR_TESTNET_ADMIN_SECRET = env.STELLAR_TESTNET_DEPLOYER_SECRET;
    console.log('Admin secret set from deployer secret (same account).');
  } else {
    throw new Error('STELLAR_TESTNET_ADMIN_SECRET is missing and deployer public does not match STELLAR_TESTNET_ADMIN_ADDRESS.');
  }
}

// Validate admin public matches address
const adminKeypair = Keypair.fromSecret(env.STELLAR_TESTNET_ADMIN_SECRET);
if (adminKeypair.publicKey() !== env.STELLAR_TESTNET_ADMIN_ADDRESS) {
  throw new Error('STELLAR_TESTNET_ADMIN_SECRET public key does not match STELLAR_TESTNET_ADMIN_ADDRESS.');
}

// Ensure operator exists and is different from admin
if (!env.STELLAR_TESTNET_OPERATOR_SECRET && !env.STELLAR_TESTNET_FIXTURE_SECRET) {
  const operator = Keypair.random();
  env.STELLAR_TESTNET_OPERATOR_SECRET = operator.secret();
  env.STELLAR_TESTNET_OPERATOR_ADDRESS = operator.publicKey();
  console.log('Generated new operator:', operator.publicKey());
  await friendbotFund(operator.publicKey());
  console.log('Funded operator via friendbot.');
} else {
  const opSecret = env.STELLAR_TESTNET_OPERATOR_SECRET || env.STELLAR_TESTNET_FIXTURE_SECRET;
  const opKeypair = Keypair.fromSecret(opSecret);
  if (opKeypair.publicKey() === adminKeypair.publicKey()) {
    throw new Error('Operator address must be different from admin address.');
  }
  if (env.STELLAR_TESTNET_OPERATOR_ADDRESS) {
    // nothing
  }
}

if (!env.CULTURAGO_ALLOW_TESTNET_MUTATIONS) {
  env.CULTURAGO_ALLOW_TESTNET_MUTATIONS = 'true';
}

saveEnv(envPath, env);
console.log('Testnet E2E env ready.');
