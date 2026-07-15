'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Download, ExternalLink, Copy, Check } from 'lucide-react';
import { Button } from './Button';

interface QRCodeBlockProps {
  value: string;
  size?: number;
  label?: string;
  showActions?: boolean;
}

export const QRCodeBlock: React.FC<QRCodeBlockProps> = ({
  value,
  size = 180,
  label,
  showActions = true,
}) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(value, {
      margin: 1.5,
      width: size * 2, // Generate higher resolution for scaling
      color: {
        dark: '#1C1A17', // Soft black / graphite
        light: '#FCFBF7', // Warm white / ivory
      },
    })
      .then((url) => setQrUrl(url))
      .catch((err) => console.error('Error generating QR code:', err));
  }, [value, size]);

  const handleDownload = () => {
    if (!qrUrl) return;
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `culturago-qr-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center justify-center p-5 bg-[#FCFBF7] rounded-xl border border-stone-200/60 shadow-xs max-w-xs mx-auto">
      {qrUrl ? (
        <div className="relative p-2 bg-white rounded-lg border border-stone-150 shadow-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt="Código QR de Verificación"
            style={{ width: size, height: size }}
            className="rounded-md"
          />
        </div>
      ) : (
        <div 
          style={{ width: size, height: size }} 
          className="flex items-center justify-center bg-stone-100 rounded-lg animate-pulse"
        >
          <QrCode className="w-8 h-8 text-stone-400" />
        </div>
      )}

      {label && (
        <p className="mt-3 text-xs text-center text-stone-500 font-medium">
          {label}
        </p>
      )}

      {showActions && (
        <div className="mt-4 flex w-full gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 text-xs"
            onClick={handleDownload}
            disabled={!qrUrl}
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            Descargar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 text-xs"
            onClick={handleCopyLink}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1" />
                Copiar
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};
