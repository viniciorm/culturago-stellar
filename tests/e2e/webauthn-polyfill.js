/**
 * Software WebAuthn client for Playwright E2E.
 *
 * Generates P-256 keypairs in the browser and returns WebAuthn ceremony
 * responses compatible with passkey-kit's `WebAuthnClient` interface.
 * Credentials are persisted to localStorage so they survive page navigation.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined') return;

  const STORAGE_KEY = '__culturagoWebAuthnCredentials';

  function b64uEncode(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64uDecode(str) {
    str += new Array(5 - (str.length % 4)).join('=');
    str = str.replace(/\-/g, '+').replace(/\_/g, '/');
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function toAsn1Integer(value) {
    // Strip leading zero bytes, then prepend 0x00 if the high bit is set.
    let start = 0;
    while (start < value.length - 1 && value[start] === 0) {
      start += 1;
    }
    let trimmed = value.slice(start);
    if (trimmed[0] & 0x80) {
      trimmed = new Uint8Array([0, ...trimmed]);
    }
    return new Uint8Array([0x02, trimmed.length, ...trimmed]);
  }

  function rawToDer(raw) {
    if (raw.length !== 64) {
      throw new Error('Unsupported raw signature length');
    }
    const r = raw.slice(0, 32);
    const s = raw.slice(32, 64);
    const rAsn1 = toAsn1Integer(r);
    const sAsn1 = toAsn1Integer(s);
    const total = rAsn1.length + sAsn1.length;
    if (total >= 0x80) {
      throw new Error('Long-form DER length not supported');
    }
    return new Uint8Array([0x30, total, ...rAsn1, ...sAsn1]);
  }

  async function sha256(input) {
    const data = input instanceof Uint8Array ? input : new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(digest);
  }

  function concat(...parts) {
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
      out.set(p, offset);
      offset += p.length;
    }
    return out;
  }

  async function createKeyPair() {
    return crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
  }

  async function serializeCredential(id, credentialId, publicKey, keyPair, counter) {
    const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    return {
      id,
      credentialId: b64uEncode(credentialId),
      publicKey: b64uEncode(publicKeyRaw),
      privateKey: privateKeyJwk,
      counter,
    };
  }

  async function importCredential(record) {
    const credentialId = b64uDecode(record.credentialId);
    const publicKeyRaw = b64uDecode(record.publicKey);
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      record.privateKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign']
    );
    const publicKey = await crypto.subtle.importKey(
      'raw',
      publicKeyRaw,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify']
    );
    return {
      id: record.id,
      credentialId,
      publicKey: publicKeyRaw,
      keyPair: { privateKey, publicKey },
      counter: record.counter ?? 0,
    };
  }

  function loadRecords() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveRecords(records) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      // ignore storage errors in test environment
    }
  }

  const credentials = new Map();

  async function syncCredentials() {
    const records = loadRecords();
    for (const record of records) {
      if (!credentials.has(record.id)) {
        try {
          const cred = await importCredential(record);
          credentials.set(record.id, cred);
        } catch {
          // ignore corrupted records
        }
      }
    }
  }

  async function saveCredential(id, credentialId, publicKey, keyPair, counter) {
    const record = await serializeCredential(id, credentialId, publicKey, keyPair, counter);
    const records = loadRecords();
    const existingIndex = records.findIndex((r) => r.id === id);
    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.push(record);
    }
    saveRecords(records);
  }

  window.__culturagoWebAuthn = {
    async startRegistration({ optionsJSON }) {
      void optionsJSON;
      await syncCredentials();
      const keyPair = await createKeyPair();
      const rawPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));

      const credentialId = new Uint8Array(32);
      crypto.getRandomValues(credentialId);
      const id = b64uEncode(credentialId);

      const cred = { credentialId, keyPair, publicKey: rawPublicKey, counter: 0 };
      credentials.set(id, cred);
      await saveCredential(id, credentialId, keyPair.publicKey, keyPair, 0);

      return {
        id,
        rawId: id,
        response: {
          publicKey: b64uEncode(rawPublicKey),
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
      await syncCredentials();

      const challenge = optionsJSON.challenge;
      if (typeof challenge !== 'string') {
        throw new Error('Missing challenge in authentication options');
      }

      const rpId = optionsJSON.rpId || window.location.hostname;
      const origin = window.location.origin;

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
        const firstId = credentials.keys().next().value;
        if (first) selected = { id: firstId, ...first };
      }

      if (!selected) {
        throw new Error('No matching passkey credential found');
      }

      const clientData = {
        type: 'webauthn.get',
        challenge,
        origin,
        crossOrigin: false,
      };
      const clientDataJSON = JSON.stringify(clientData);
      const clientDataHash = await sha256(new TextEncoder().encode(clientDataJSON));

      const rpIdHash = await sha256(new TextEncoder().encode(rpId));
      const flags = 0x05; // user present + user verified
      selected.counter += 1;
      const counterBytes = new Uint8Array(4);
      const view = new DataView(counterBytes.buffer);
      view.setUint32(0, selected.counter, false);
      const authenticatorData = concat(rpIdHash, new Uint8Array([flags]), counterBytes);

      const message = concat(authenticatorData, clientDataHash);
      const rawSignature = new Uint8Array(
        await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          selected.keyPair.privateKey,
          message
        )
      );
      const derSignature = rawToDer(rawSignature);

      await saveCredential(selected.id, selected.credentialId, selected.keyPair.publicKey, selected.keyPair, selected.counter);

      return {
        id: selected.id,
        rawId: selected.id,
        response: {
          authenticatorData: b64uEncode(authenticatorData),
          clientDataJSON: b64uEncode(new TextEncoder().encode(clientDataJSON)),
          signature: b64uEncode(derSignature),
          userHandle: b64uEncode(selected.credentialId),
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'cross-platform',
        type: 'public-key',
      };
    },
  };
})();
