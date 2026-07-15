import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Clock, ShieldCheck, Wallet, RefreshCw } from 'lucide-react';
import { EntityStatus, StellarStatus, WalletStatus } from '../../lib/db';

// --- Verification Status Badge ---
interface StatusBadgeProps {
  status: EntityStatus | 'issued' | 'revoked';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const styles = {
    draft: 'bg-stone-100 text-stone-700 border-stone-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    issued: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    revoked: 'bg-rose-50 text-rose-700 border-rose-200',
    archived: 'bg-stone-100 text-stone-500 border-stone-200',
  };

  const labels = {
    draft: 'Borrador',
    pending: 'Registro pendiente',
    verified: 'Verificado por FDVC',
    issued: 'Emitida',
    revoked: 'Revocada',
    archived: 'Archivado',
  };

  const icons = {
    draft: <Clock className="w-3.5 h-3.5 mr-1" />,
    pending: <Clock className="w-3.5 h-3.5 mr-1" />,
    verified: <CheckCircle2 className="w-3.5 h-3.5 mr-1" />,
    issued: <CheckCircle2 className="w-3.5 h-3.5 mr-1" />,
    revoked: <XCircle className="w-3.5 h-3.5 mr-1" />,
    archived: <XCircle className="w-3.5 h-3.5 mr-1" />,
  };

  const currentStyle = styles[status] || styles.draft;
  const currentLabel = labels[status] || status;
  const currentIcon = icons[status] || null;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${currentStyle}`}>
      {currentIcon}
      {currentLabel}
    </span>
  );
};

// --- Stellar Blockchain Status Badge ---
interface StellarStatusBadgeProps {
  status: StellarStatus;
  type?: 'entity' | 'credential';
}

export const StellarStatusBadge: React.FC<StellarStatusBadgeProps> = ({ status, type = 'entity' }) => {
  const styles = {
    not_registered: 'bg-stone-100 text-stone-600 border-stone-200',
    pending: 'bg-amber-50 text-amber-600 border-amber-200',
    registered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    failed: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  const labels = {
    not_registered: 'No Registrado en Stellar',
    pending: 'Registro Stellar Pendiente',
    registered: 'Registro Stellar Verificado',
    failed: 'Error de Registro Stellar',
  };

  const icons = {
    not_registered: <RefreshCw className="w-3.5 h-3.5 mr-1 opacity-60" />,
    pending: <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin text-amber-500" />,
    registered: <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />,
    failed: <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-500" />,
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
      {icons[status]}
      {labels[status]}
    </span>
  );
};

// --- Wallet Status Badge ---
interface WalletStatusBadgeProps {
  status: WalletStatus;
}

export const WalletStatusBadge: React.FC<WalletStatusBadgeProps> = ({ status }) => {
  const styles = {
    none: 'bg-stone-100 text-stone-500 border-stone-200',
    reserved: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    claimed: 'bg-teal-50 text-teal-700 border-teal-200',
  };

  const labels = {
    none: 'Pasaporte aún no reclamado',
    reserved: 'Pasaporte Reservado (Passkey)',
    claimed: 'Pasaporte Reclamado',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
      <Wallet className="w-3.5 h-3.5 mr-1 opacity-75" />
      {labels[status]}
    </span>
  );
};

// --- Small Simple Verification Badge ---
export const VerificationBadge: React.FC = () => {
  return (
    <span className="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-0.5">
      <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600 fill-emerald-100" />
      Verificado FDVC
    </span>
  );
};
