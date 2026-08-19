import React from 'react';
import { Globe } from 'lucide-react';
import { explorerUrlForContract, explorerUrlForTx } from '../infrastructure/config/env';

interface Props {
  txHash?: string | null;
  contractId?: string | null;
}

/**
 * Explorer links are environment-gated: in demo mode (or without a
 * configured explorer base) NO links to testnet/mainnet are rendered.
 */
export function StellarVerificationLinks({ txHash, contractId }: Props) {
  const txUrl = txHash ? explorerUrlForTx(txHash) : null;
  const contractUrl = contractId ? explorerUrlForContract(contractId) : null;

  if (!txUrl && !contractUrl) {
    return (
      <span className="text-stone-400 italic text-xs">
        Explorador no disponible en modo demo.
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-3">
      {txUrl && (
        <a
          href={txUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[#5C061E] hover:underline inline-flex items-center gap-0.5 text-xs font-semibold"
        >
          <Globe className="w-3.5 h-3.5" />
          Ver transacción
        </a>
      )}
      {contractUrl && (
        <a
          href={contractUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[#5C061E] hover:underline inline-flex items-center gap-0.5 text-xs font-semibold"
        >
          <Globe className="w-3.5 h-3.5" />
          Ver contrato
        </a>
      )}
    </span>
  );
}
