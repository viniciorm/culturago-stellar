import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CheckCircle2,
  XCircle,
  Download,
  QrCode,
  ShieldCheck,
  Calendar,
  MapPin,
  Award,
  Layers,
  Building,
  User,
  Hash,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { PublicLayout } from '@/components/PublicLayout';
import { CredentialV2Service } from '@/infrastructure/credentials/v2/CredentialV2Service';

interface PageProps {
  params: Promise<{ publicId: string }>;
}

export default async function CredentialV2PublicPage({ params }: PageProps) {
  const { publicId } = await params;
  const service = new CredentialV2Service();
  const cred = await service.getCredentialByPublicId(publicId);

  if (!cred) {
    notFound();
  }

  const isDev =
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_APP_ENV === 'dev' ||
    process.env.CULTURAGO_ENV === 'development';

  const isRevoked = cred.status === 'revoked';
  const qrUrl = `/api/credentials/${encodeURIComponent(cred.publicId)}/qr`;
  const pdfUrl = `/api/credentials/${encodeURIComponent(cred.publicId)}/pdf`;

  const subjectDisplayName = cred.subject.artisticName
    ? `${cred.subject.displayName} ("${cred.subject.artisticName}")`
    : cred.subject.displayName;

  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto space-y-8 pb-12">
        {/* Environment banner if dev */}
        {isDev && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-wide uppercase px-2 py-0.5 rounded-md bg-amber-200 text-amber-950 text-xs">
                DEV
              </span>
              <span>Ambiente de Desarrollo / Pruebas — CulturaGO Testnet</span>
            </div>
            <span className="text-xs text-amber-700 font-mono">{cred.publicId}</span>
          </div>
        )}

        {/* Status Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-white border border-stone-200/80 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-semibold text-stone-600 tracking-wider">
                Verificación Pública de Credencial
              </span>
              <span className="text-xs font-mono text-stone-600 px-2 py-0.5 bg-stone-100 rounded-md">
                v2 off-chain
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900">
              {cred.displayLabel}
            </h1>
            <p className="text-stone-600 text-sm sm:text-base">
              {cred.displaySubtitle}
            </p>
          </div>

          <div>
            {isRevoked ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold text-sm">
                <XCircle className="w-5 h-5 text-rose-600" />
                <span>Credencial Revocada</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Credencial Válida y Activa</span>
              </div>
            )}
          </div>
        </div>

        {/* Certificate Card */}
        <div className="rounded-2xl bg-white border border-stone-200/80 shadow-sm overflow-hidden">
          {/* Decorative header */}
          <div className="h-3 bg-linear-to-r from-[#5C061E] via-[#8A1434] to-[#C5A880]" />

          <div className="p-6 sm:p-8 space-y-8">
            {/* Subject Hero */}
            <div className="border-b border-stone-100 pb-6 space-y-2">
              <span className="text-xs uppercase font-semibold text-stone-600 tracking-wider flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#5C061E]" />
                Otorgado a
              </span>
              <div className="text-2xl sm:text-3xl font-serif font-bold text-stone-900">
                {subjectDisplayName}
              </div>
              {cred.roles.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-stone-600 font-medium">Rol(es):</span>
                  {cred.roles.map((r) => (
                    <span
                      key={r}
                      className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#5C061E]/5 text-[#5C061E] border border-[#5C061E]/15"
                    >
                      {r}
                    </span>
                  ))}
                  {cred.participationMode && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-stone-100 text-stone-600">
                      Modalidad: {cred.participationMode === 'solo' ? 'Solista' : cred.participationMode === 'group' ? 'Grupal' : 'Institucional'}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Event & Organization Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <span className="text-xs uppercase font-semibold text-stone-600 tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-[#5C061E]" />
                  Evento Cultural
                </span>
                <div className="font-semibold text-stone-800 text-lg">
                  {cred.event.name}
                  {cred.event.year ? ` (${cred.event.year})` : ''}
                </div>
                {cred.event.location && (
                  <div className="text-xs text-stone-600 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {cred.event.location}
                  </div>
                )}
                {cred.event.startDate && (
                  <div className="text-xs text-stone-600 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {cred.event.startDate}
                    {cred.event.endDate && ` al ${cred.event.endDate}`}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <span className="text-xs uppercase font-semibold text-stone-600 tracking-wider flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-[#5C061E]" />
                  Entidad Emisora
                </span>
                <div className="font-semibold text-stone-800 text-lg">
                  {cred.issuer.displayName}
                </div>
                <div className="text-xs text-stone-600">
                  Tipo: <span className="font-medium capitalize">{cred.issuer.kind}</span>
                </div>
                {cred.organizationName && (
                  <div className="text-xs text-stone-600 pt-1">
                    Agrupación / Escuela:{' '}
                    <span className="font-semibold text-stone-800">
                      {cred.organizationName}
                    </span>
                  </div>
                )}
                {cred.presentationCode && (
                  <div className="text-xs text-stone-600">
                    Código de Presentación:{' '}
                    <span className="font-mono font-semibold text-stone-800">
                      {cred.presentationCode}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Evidences summary */}
            {cred.evidences && cred.evidences.length > 0 && (
              <div className="border-t border-stone-100 pt-6 space-y-3">
                <span className="text-xs uppercase font-semibold text-stone-600 tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-[#5C061E]" />
                  Evidencias de Respaldo ({cred.evidences.length})
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {cred.evidences.map((ev, i) => (
                    <div
                      key={ev.id || i}
                      className="p-3 rounded-xl bg-stone-50 border border-stone-200/60 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-stone-800 capitalize">
                          {ev.evidenceRole}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 bg-white border border-stone-200 rounded-md font-mono text-stone-600">
                          {ev.sourceType}
                        </span>
                      </div>
                      <div className="font-mono text-stone-600 text-[11px] truncate">
                        ID: {ev.sourceId}
                      </div>
                      {ev.notes && (
                        <div className="text-stone-600 italic text-[11px]">
                          {ev.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions & QR */}
            <div className="border-t border-stone-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                <a
                  href={pdfUrl}
                  download
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#5C061E] hover:bg-[#4A0518] text-white font-medium text-sm transition-colors shadow-xs"
                >
                  <Download className="w-4 h-4" />
                  Descargar Certificado (PDF)
                </a>

                <a
                  href={qrUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 font-medium text-sm transition-colors"
                >
                  <QrCode className="w-4 h-4 text-stone-500" />
                  Ver Código QR
                </a>
              </div>

              {/* Inline QR preview */}
              <div className="flex items-center gap-4 bg-stone-50 border border-stone-200/60 p-3 rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrUrl}
                  alt={`QR ${cred.publicId}`}
                  className="w-20 h-20 bg-white rounded-lg p-1 border border-stone-200 shadow-2xs"
                />
                <div className="text-xs space-y-1">
                  <div className="font-semibold text-stone-800">Código QR Oficial</div>
                  <div className="text-stone-600">Escanea para validar autenticidad</div>
                  <div className="font-mono text-stone-600 text-[11px]">{cred.publicId}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Cryptographic & Technical Integrity Section */}
        <details className="group rounded-2xl bg-white border border-stone-200/80 shadow-xs overflow-hidden">
          <summary className="flex items-center justify-between p-5 cursor-pointer select-none hover:bg-stone-50 transition-colors">
            <div className="flex items-center gap-2 text-stone-800 font-semibold text-sm">
              <ShieldCheck className="w-5 h-5 text-[#5C061E]" />
              <span>Detalles Técnicos e Integridad Criptográfica</span>
            </div>
            <ChevronDown className="w-4 h-4 text-stone-400 group-open:rotate-180 transition-transform" />
          </summary>

          <div className="p-6 border-t border-stone-100 bg-stone-50/50 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-stone-600 font-medium">Versión de Esquema:</span>
                <div className="font-mono font-semibold text-stone-800 mt-0.5">
                  {cred.schemaVersion}
                </div>
              </div>
              <div>
                <span className="text-stone-600 font-medium">Algoritmo de Canonicalización:</span>
                <div className="font-mono font-semibold text-stone-800 mt-0.5">
                  RFC 8785 (JSON Canonicalization Scheme - JCS)
                </div>
              </div>
              <div>
                <span className="text-stone-600 font-medium">Algoritmo de Resumen (Digest):</span>
                <div className="font-mono font-semibold text-stone-800 mt-0.5">
                  SHA-256 con Domain Separator
                </div>
              </div>
              <div>
                <span className="text-stone-600 font-medium">Fecha de Emisión:</span>
                <div className="font-mono text-stone-800 mt-0.5">{cred.issuedAt}</div>
              </div>
            </div>

            <div>
              <span className="text-stone-600 font-medium">Payload Digest (SHA-256):</span>
              <div className="font-mono break-all p-2.5 rounded-lg bg-stone-100 text-stone-900 border border-stone-200 mt-1 select-all">
                {cred.payloadDigest}
              </div>
            </div>

            <div>
              <span className="text-stone-600 font-medium">
                Canonical Payload Inmutable (JSON):
              </span>
              <pre className="mt-1 p-3 rounded-lg bg-stone-900 text-stone-100 font-mono text-[11px] overflow-x-auto max-h-72 select-all leading-relaxed">
                {JSON.stringify(cred.canonicalPayload, null, 2)}
              </pre>
            </div>
          </div>
        </details>
      </div>
    </PublicLayout>
  );
}
