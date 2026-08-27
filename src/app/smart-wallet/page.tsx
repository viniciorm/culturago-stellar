'use client';

import { useState } from 'react';
import { PasskeyKitSigner } from '@/lib/smartWallet/PasskeyKitSigner';

const rpcUrl = process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? '';
const networkPassphrase = process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? '';
const walletWasmHash = process.env.NEXT_PUBLIC_SMART_WALLET_WASM_HASH ?? '';
const acceptedWasmHashes = (process.env.NEXT_PUBLIC_SMART_WALLET_ACCEPTED_WASM_HASHES ?? '')
  .split(',')
  .filter((s) => s.length > 0);
const rpId = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const explorerTxBase = networkPassphrase.includes('Test')
  ? 'https://stellar.expert/explorer/testnet/tx/'
  : 'https://stellar.expert/explorer/public/tx/';

function hex32(input: string): string {
  const hex = Array.from(input)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
  return (hex + '0'.repeat(64)).slice(0, 64);
}

export default function SmartWalletPage() {
  const [signer, setSigner] = useState<PasskeyKitSigner | null>(null);
  const [contractId, setContractId] = useState('');
  const [keyId, setKeyId] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [bailarinaId, setBailarinaId] = useState('');
  const [organizerId, setOrganizerId] = useState('');
  const [eventId] = useState(hex32('evento-bailarina'));
  const [lastCredentialId, setLastCredentialId] = useState('');
  const [lastTxHash, setLastTxHash] = useState('');

  const addLog = (message: string) => setLog((prev) => [...prev, message]);

  const initKit = async () => {
    const s = new PasskeyKitSigner(rpcUrl, networkPassphrase, walletWasmHash, acceptedWasmHashes, rpId);
    setSigner(s);
    addLog('PasskeyKit Signer inicializado.');
  };

  const createWallet = async () => {
    if (!signer) return;
    setLoading(true);
    try {
      const { keyId: keyIdBase64, contractId: cid, signedTx } = await signer.createWallet('CulturaGO', 'test-user');
      setKeyId(keyIdBase64);
      setContractId(cid);
      addLog(`Wallet creada: ${cid}`);
      addLog(`signedTx length: ${signedTx.length}`);
    } catch (e) {
      addLog(`Error creando wallet: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const connectWallet = async () => {
    if (!signer || !keyId) return;
    setLoading(true);
    try {
      const cid = await signer.connectWallet(keyId);
      setContractId(cid);
      addLog(`Wallet conectada: ${cid}`);
    } catch (e) {
      addLog(`Error conectando: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const sendCommand = async (command: Record<string, unknown>) => {
    if (!signer || !contractId) return;
    setLoading(true);
    try {
      addLog(`Preparando: ${command.kind}...`);
      const prepareRes = await fetch('/api/sign/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
      const prepareData = await prepareRes.json();
      if (!prepareRes.ok || !prepareData.prepared) throw new Error(prepareData.error ?? 'prepare failed');
      addLog(`Preparado: ${prepareData.prepared.operationId}`);

      addLog('Firmando con passkey...');
      const signed = await signer.sign(prepareData.prepared);
      addLog(`Firmado, signedXdr length: ${signed.signedXdr.length}`);

      const submitRes = await fetch('/api/sign/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: prepareData.prepared.operationId,
          signedXdr: signed.signedXdr,
          signerAddress: signed.signerAddress,
        }),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitData.error ?? 'submit failed');
      addLog(`Confirmado: ${JSON.stringify(submitData.operation)}`);
      if (submitData.operation?.txHash) {
        setLastTxHash(submitData.operation.txHash);
      }
      return submitData.operation;
    } catch (e) {
      addLog(`Error: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const grantRoles = async () => {
    if (!contractId) {
      addLog('Primero creá/conectá la wallet');
      return;
    }
    setLoading(true);
    try {
      const id = organizerId || hex32('organizer-' + self.crypto.randomUUID().slice(0, 8));
      setOrganizerId(id);
      const res = await fetch('/api/testnet/grant-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operator: contractId,
          registrar: contractId,
          issuerId: id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'grant roles failed');
      addLog(`Roles otorgados: ${data.txHashes.length} txs`);
    } catch (e) {
      addLog(`Error otorgando roles: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const registerOrganizer = async () => {
    const id = organizerId || hex32('organizer-' + self.crypto.randomUUID().slice(0, 8));
    setOrganizerId(id);
    await sendCommand({
      kind: 'register_entity',
      idempotencyKey: self.crypto.randomUUID(),
      actorAddress: contractId,
      entityId: id,
      metadataHash: hex32('organizer-metadata'),
      hashSchema: 1,
    });
    return id;
  };

  const registerBailarina = async () => {
    const id = hex32('bailarina-' + self.crypto.randomUUID().slice(0, 8));
    setBailarinaId(id);
    await sendCommand({
      kind: 'register_entity',
      idempotencyKey: self.crypto.randomUUID(),
      actorAddress: contractId,
      entityId: id,
      metadataHash: hex32('bailarina-metadata'),
      hashSchema: 1,
    });
    return id;
  };

  const issueCredential = async (issuerOverride?: string, subjectOverride?: string) => {
    const subject = subjectOverride || bailarinaId;
    if (!subject) {
      addLog('Primero registrá a la bailarina');
      return;
    }
    const id = hex32('credential-' + self.crypto.randomUUID().slice(0, 8));
    setLastCredentialId(id);
    const issuer = issuerOverride || organizerId || subject;
    await sendCommand({
      kind: 'issue_credential',
      idempotencyKey: self.crypto.randomUUID(),
      actorAddress: contractId,
      credentialId: id,
      issuerId: issuer,
      subjectId: subject,
      eventId,
      credentialType: 1,
      metadataHash: hex32('credential-metadata'),
      hashSchema: 1,
    });
    return id;
  };

  const revokeCredential = async () => {
    if (!lastCredentialId) {
      addLog('Primero emití una credencial');
      return;
    }
    await sendCommand({
      kind: 'revoke_credential',
      idempotencyKey: self.crypto.randomUUID(),
      actorAddress: contractId,
      credentialId: lastCredentialId,
    });
  };

  const fullBailarinaFlow = async () => {
    try {
      await grantRoles();
      const org = await registerOrganizer();
      const bail = await registerBailarina();
      await issueCredential(org, bail);
      addLog('Flujo bailarina completado.');
    } catch (e) {
      addLog(`Flujo abortado: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Smart Wallet (Passkey Testnet)</h1>
      <div className="space-y-2 mb-4">
        <div>
          <button onClick={initKit} disabled={loading} className="bg-gray-200 px-4 py-2 rounded">Inicializar Signer</button>
          <button onClick={createWallet} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded ml-2">Crear wallet</button>
          <button onClick={connectWallet} disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded ml-2">Conectar wallet</button>
        </div>
        <div>
          <button onClick={grantRoles} disabled={loading} className="bg-pink-600 text-white px-4 py-2 rounded">Otorgar roles</button>
          <button onClick={registerBailarina} disabled={loading} className="bg-yellow-600 text-white px-4 py-2 rounded ml-2">Registrar bailarina</button>
          <button onClick={registerOrganizer} disabled={loading} className="bg-orange-600 text-white px-4 py-2 rounded ml-2">Registrar organizador</button>
          <button onClick={() => issueCredential()} disabled={loading} className="bg-indigo-600 text-white px-4 py-2 rounded ml-2">Emitir credencial</button>
          <button onClick={revokeCredential} disabled={loading} className="bg-red-600 text-white px-4 py-2 rounded ml-2">Revocar credencial</button>
        </div>
        <div>
          <button onClick={fullBailarinaFlow} disabled={loading} className="bg-purple-600 text-white px-4 py-2 rounded">Flujo completo bailarina</button>
        </div>
      </div>
      <div className="text-sm text-gray-700 mb-4">
        <p><strong>Contract ID:</strong> {contractId || '-'}</p>
        <p><strong>Key ID:</strong> {keyId ? `${keyId.slice(0, 16)}...` : '-'}</p>
        <p><strong>Organizador:</strong> {organizerId || '-'}</p>
        <p><strong>Bailarina:</strong> {bailarinaId || '-'}</p>
        <p><strong>Evento:</strong> {eventId}</p>
        <p><strong>Última credencial:</strong> {lastCredentialId || '-'}</p>
      </div>
      {lastTxHash && (
        <div className="text-sm text-gray-700 mb-4">
          <span>Explorer: </span>
          <a
            href={`${explorerTxBase}${lastTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline"
          >
            Ver {lastTxHash.slice(0, 12)}... en Stellar Explorer
          </a>
        </div>
      )}
      <div className="bg-black text-green-400 p-4 rounded text-sm font-mono h-64 overflow-auto">
        {log.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </main>
  );
}
