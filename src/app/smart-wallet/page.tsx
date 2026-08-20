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

  const prepareAndSign = async () => {
    if (!signer || !contractId) return;
    setLoading(true);
    try {
      const idempotencyKey = self.crypto.randomUUID();
      const command = {
        kind: 'register_entity' as const,
        idempotencyKey,
        actorAddress: contractId,
        entityId: hex32('test-entity'),
        metadataHash: hex32('demo-metadata'),
        hashSchema: 1,
      };
      addLog('Preparando transacción en backend...');
      const prepareRes = await fetch('/api/sign/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
      const prepareData = await prepareRes.json();
      if (!prepareRes.ok || !prepareData.prepared) throw new Error(prepareData.error ?? 'prepare failed');
      addLog(`Transacción preparada: ${prepareData.prepared.operationId}`);

      addLog('Firmando con passkey...');
      const signed = await signer.sign(prepareData.prepared);
      addLog(`Firmado, signedXdr length: ${signed.signedXdr.length}`);

      addLog('Enviando transacción firmada...');
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
      addLog(`Submit: ${JSON.stringify(submitData.operation)}`);
    } catch (e) {
      addLog(`Error end-to-end: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Smart Wallet (Passkey Testnet)</h1>
      <div className="space-y-2 mb-4">
        <button onClick={initKit} disabled={loading} className="bg-gray-200 px-4 py-2 rounded">Inicializar Signer</button>
        <button onClick={createWallet} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded ml-2">Crear wallet</button>
        <button onClick={connectWallet} disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded ml-2">Conectar wallet</button>
        <button onClick={prepareAndSign} disabled={loading} className="bg-purple-600 text-white px-4 py-2 rounded ml-2">Preparar + Firmar</button>
      </div>
      <div className="text-sm text-gray-700 mb-4">
        <p><strong>Contract ID:</strong> {contractId || '-'}</p>
        <p><strong>Key ID:</strong> {keyId ? `${keyId.slice(0, 16)}...` : '-'}</p>
      </div>
      <div className="bg-black text-green-400 p-4 rounded text-sm font-mono h-64 overflow-auto">
        {log.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </main>
  );
}
