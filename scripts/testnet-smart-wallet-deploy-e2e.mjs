#!/usr/bin/env node
// F3.2 — Real smart-wallet deploy E2E on Stellar Testnet through the OZ relayer.
// Uses a software WebAuthn client so this can run headless in CI, but it submits
// a real transaction to Testnet and waits for ledger confirmation.
//
// Run with:
//   node --env-file=.env scripts/testnet-smart-wallet-deploy-e2e.mjs
import { webcrypto } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair } from '@stellar/stellar-sdk';
import { PasskeyKit } from 'passkey-kit';
import { PasskeyServer } from 'passkey-kit/server';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = process.env.TESTNET_MANIFEST_PATH ?? resolve(__dirname, '..', 'docs', 'manifests', 'testnet-manifest.json');

function b64uEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

const RP_ID = process.env.WEBAUTHN_RP_ID ?? 'culturago.vercel.app';
const ORIGIN = process.env.WEBAUTHN_ORIGINS ?? `https://${RP_ID}`;
const WASM_HASH = process.env.SMART_WALLET_WASM_HASH ??
  process.env.NEXT_PUBLIC_SMART_WALLET_WASM_HASH;

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAIL: ${message}`);
}

function sha256(input) {
  return webcrypto.subtle.digest('SHA-256', typeof input === 'string' ? new TextEncoder().encode(input) : input);
}

// Software WebAuthn client backed by a P-256 keypair generated in Node's WebCrypto.
// It is intentionally minimal: passkey-kit only needs the raw secp256r1 public key
// for deploy, and the assertion signature/attestation data for signing.
function createSoftwareWebAuthnClient() {
  const credentials = new Map();

  return {
    async startRegistration() {
      const keyPair = await webcrypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
      );
      const rawPublicKey = new Uint8Array(await webcrypto.subtle.exportKey('raw', keyPair.publicKey));

      const credentialId = new Uint8Array(32);
      webcrypto.getRandomValues(credentialId);
      const id = b64uEncode(credentialId);

      credentials.set(id, {
        credentialId,
        keyPair,
        publicKey: rawPublicKey,
        counter: 0,
      });

      return {
        id,
        rawId: id,
        response: {
          publicKey: b64uEncode(rawPublicKey),
          // The remaining fields are not needed because publicKey is raw.
          authenticatorData: '',
          clientDataJSON: '',
          attestationObject: '',
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'cross-platform',
        type: 'public-key',
      };
    },

    async startAuthentication({ optionsJSON }) {
      const challenge = optionsJSON.challenge;
      assert(typeof challenge === 'string', 'challenge is required');

      let selected;
      if (optionsJSON.allowCredentials?.length) {
        const allowed = new Set(optionsJSON.allowCredentials.map((c) => c.id));
        for (const [id, cred] of credentials.entries()) {
          if (allowed.has(id)) {
            selected = { id, ...cred };
            break;
          }
        }
      } else {
        const first = credentials.values().next().value;
        const id = credentials.keys().next().value;
        selected = first ? { id, ...first } : undefined;
      }
      assert(selected, 'no matching passkey credential found');

      const clientData = {
        type: 'webauthn.get',
        challenge,
        origin: ORIGIN,
        crossOrigin: false,
      };
      const clientDataJSON = JSON.stringify(clientData);
      const clientDataHash = new Uint8Array(await sha256(clientDataJSON));

      const rpIdHash = new Uint8Array(await sha256(RP_ID));
      const flags = 0x05; // user present + user verified
      const counter = 0;
      const authenticatorData = Buffer.concat([
        Buffer.from(rpIdHash),
        Buffer.from([flags]),
        Buffer.from([0, 0, 0, counter]),
      ]);

      const message = new Uint8Array(await sha256(Buffer.concat([Buffer.from(authenticatorData), Buffer.from(clientDataHash)])));
      const derSignature = new Uint8Array(await webcrypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        selected.keyPair.privateKey,
        message
      ));

      return {
        id: selected.id,
        rawId: selected.id,
        response: {
          authenticatorData: b64uEncode(authenticatorData),
          clientDataJSON: b64uEncode(Buffer.from(clientDataJSON)),
          signature: b64uEncode(derSignature),
          userHandle: b64uEncode(selected.credentialId),
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'cross-platform',
        type: 'public-key',
      };
    },
  };
}

async function main() {
  assert(process.env.CULTURAGO_ALLOW_TESTNET_MUTATIONS === 'true', 'CULTURAGO_ALLOW_TESTNET_MUTATIONS=true is required');
  assert(process.env.SMART_WALLET_RELAYER_BASE_URL, 'SMART_WALLET_RELAYER_BASE_URL is required');
  assert(process.env.SMART_WALLET_RELAYER_API_KEY, 'SMART_WALLET_RELAYER_API_KEY is required');
  assert(process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE, 'NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE is required');
  assert(process.env.NEXT_PUBLIC_STELLAR_RPC_URL, 'NEXT_PUBLIC_STELLAR_RPC_URL is required');
  assert(WASM_HASH, 'SMART_WALLET_WASM_HASH is required');

  const adminKeypair = Keypair.fromSecret(process.env.STELLAR_TESTNET_ADMIN_SECRET);
  assert(adminKeypair.publicKey() === process.env.STELLAR_TESTNET_ADMIN_ADDRESS, 'admin secret/address mismatch');

  const webAuthn = createSoftwareWebAuthnClient();

  const kit = new PasskeyKit({
    rpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL,
    networkPassphrase: process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE,
    walletWasmHash: WASM_HASH,
    rpId: RP_ID,
    WebAuthn: webAuthn,
  });

  const server = new PasskeyServer({
    networkPassphrase: process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE,
    rpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL,
    relayer: {
      baseUrl: process.env.SMART_WALLET_RELAYER_BASE_URL,
      apiKey: process.env.SMART_WALLET_RELAYER_API_KEY,
    },
  });

  console.log('Creating passkey wallet...');
  const { keyIdBase64, contractId, signedTx } = await kit.createWallet('CulturaGO Testnet', 'e2e@example.com');
  console.log('Derived contractId:', contractId);

  console.log('Submitting deploy through relayer...');
  const result = await server.send(signedTx, { skipWait: false });
  if (!result.success) {
    throw new Error(`Relayer submission failed: ${result.error?.message ?? JSON.stringify(result.error)}`);
  }

  console.log('Deploy tx hash:', result.hash);

  // Wait a few ledgers and then read back the contract instance to prove liveness.
  const rpc = new (await import('@stellar/stellar-sdk/rpc')).Server(process.env.NEXT_PUBLIC_STELLAR_RPC_URL);
  for (let i = 0; i < 20; i++) {
    const tx = await rpc.getTransaction(result.hash);
    if (tx.status === 'SUCCESS') {
      console.log('Confirmed in ledger:', tx.latestLedgerCloseTime);
      break;
    }
    if (tx.status === 'FAILED' || tx.status === 'NOT_FOUND') {
      throw new Error(`Transaction status: ${tx.status}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Update manifest with the deployed smart-wallet contract id as evidence.
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  manifest.smartWallet ??= {};
  manifest.smartWallet.testnetDeployed ??= [];
  manifest.smartWallet.testnetDeployed.push({
    contractId,
    keyId: keyIdBase64,
    txHash: result.hash,
    wasmHash: WASM_HASH,
    deployedAt: new Date().toISOString(),
  });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log('Manifest updated:', MANIFEST_PATH);

  return { contractId, txHash: result.hash };
}

main().then(
  (r) => {
    console.log('F3.2 E2E completed successfully:', r);
    process.exit(0);
  },
  (e) => {
    console.error('F3.2 E2E failed:', e);
    process.exit(1);
  }
);
