import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Download,
  QrCode,
  Calendar,
  MapPin,
  Award,
  Building,
  User,
  AlertTriangle,
  ArrowLeft,
  Eye,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { PublicLayout } from '@/components/PublicLayout';
import { getPreviewCase } from '@/fixtures/fdvc2026-previews';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CredentialPreviewDetailPage({ params }: PageProps) {
  const { id } = await params;
  const preview = getPreviewCase(id);

  if (!preview) {
    notFound();
  }

  const qrUrl = `/dev/credential-previews/${encodeURIComponent(preview.id)}/qr`;
  const pdfDownloadUrl = `/dev/credential-previews/${encodeURIComponent(preview.id)}/pdf`;
  const pdfViewUrl = `/dev/credential-previews/${encodeURIComponent(preview.id)}/pdf?inline=true`;

  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-16 px-2 sm:px-4">
        {/* Navigation back */}
        <div className="flex items-center justify-between">
          <Link
            href="/dev/credential-previews"
            className="inline-flex items-center gap-2 text-sm text-stone-600 hover:text-[#5C061E] font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a Casos de Preview FDVC 2026
          </Link>
          <span className="text-xs font-mono bg-stone-100 text-stone-600 px-2 py-0.5 rounded-md border border-stone-200">
            Caso {preview.caseLetter} &bull; {preview.presentationCode}
          </span>
        </div>

        {/* Development Preview Banner */}
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/90 p-4 sm:p-5 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-200 text-amber-900 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-xs uppercase tracking-wide px-2.5 py-0.5 rounded-md bg-amber-200 text-amber-950">
                  Vista Previa de Evaluación
                </span>
                <span className="text-xs font-semibold text-amber-900">
                  Aún no emitida &bull; Sin persistencia en base de datos
                </span>
              </div>
              <p className="text-xs sm:text-sm text-amber-900 leading-relaxed">
                Esta es una simulación visual y funcional para revisar el contenido, redacción y diseño
                de los certificados del <strong>Festival Nacional Danza del Vientre Chile 2026</strong> antes de su emisión definitiva.
              </p>
            </div>
          </div>
        </div>

        {/* Main Cultural Credential View */}
        <div className="rounded-3xl bg-white border border-stone-200/90 shadow-sm overflow-hidden">
          {/* Header Bar Accent */}
          <div className="h-3 bg-linear-to-r from-[#5C061E] via-[#8A1434] to-[#C5A880]" />

          <div className="p-6 sm:p-10 space-y-8">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-6">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase font-semibold text-stone-600 tracking-wider">
                    Credencial Cultural Verificable
                  </span>
                  <span className="text-xs font-mono text-[#5C061E] px-2 py-0.5 bg-[#5C061E]/5 rounded-md border border-[#5C061E]/15">
                    {preview.previewCode}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900">
                  {preview.displayLabel}
                </h1>
                <p className="text-sm sm:text-base text-stone-600">
                  {preview.event.name}
                </p>
              </div>

              {/* Status Badge */}
              <div className="self-start sm:self-center">
                <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-300/80 text-amber-900 text-xs sm:text-sm font-semibold">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>Vista previa — aún no emitida</span>
                </div>
              </div>
            </div>

            {/* Subject Hero */}
            <div className="space-y-3">
              <span className="text-xs uppercase font-semibold text-stone-600 tracking-wider flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#5C061E]" />
                Reconocimiento otorgado a
              </span>
              <div className="text-2xl sm:text-4xl font-serif font-bold text-stone-900 tracking-tight">
                {preview.subject.displayName}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#5C061E]/10 text-[#5C061E] border border-[#5C061E]/20">
                  {preview.displayLabel}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-stone-100 text-stone-700">
                  Modalidad: {preview.mode === 'solo' ? 'Solista' : 'Grupal'}
                </span>
                {preview.organizationName && (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-stone-100 text-stone-700 flex items-center gap-1">
                    <Building className="w-3.5 h-3.5 text-stone-500" />
                    {preview.organizationName}
                  </span>
                )}
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* Event Box */}
              <div className="p-5 rounded-2xl bg-stone-50/80 border border-stone-200/70 space-y-3">
                <div className="text-xs uppercase font-semibold text-stone-600 tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-[#5C061E]" />
                  Evento Cultural
                </div>
                <div className="font-semibold text-stone-900 text-base">
                  {preview.event.name}
                </div>
                <div className="space-y-1 text-xs text-stone-600">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                    <span>{preview.event.dateText}</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-stone-500 shrink-0 mt-0.5" />
                    <span>{preview.event.locationText}</span>
                  </div>
                </div>
              </div>

              {/* Accreditation Box */}
              <div className="p-5 rounded-2xl bg-stone-50/80 border border-stone-200/70 space-y-3">
                <div className="text-xs uppercase font-semibold text-stone-600 tracking-wider flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-[#5C061E]" />
                  Acreditado Por
                </div>
                <div className="font-semibold text-stone-900 text-base">
                  {preview.issuer.name}
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Entidad cultural responsable de la dirección artística, organización y certificación oficial de la participación.
                </p>
                <div className="text-xs text-stone-600 font-mono pt-1">
                  Código de Presentación: <strong className="text-stone-800">{preview.presentationCode}</strong>
                </div>
              </div>
            </div>

            {/* Visual Certificate Simulation Card */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold text-stone-600 tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#5C061E]" />
                  Vista Previa del Certificado Oficial
                </span>
                <span className="text-xs text-stone-600">
                  Formato A4 Horizontal
                </span>
              </div>

              {/* Certificate Canvas / Card */}
              <div className="relative rounded-2xl border-2 border-[#C5A880]/60 bg-[#FCFBF7] p-6 sm:p-10 shadow-inner space-y-6 text-center">
                {/* Decorative border frame */}
                <div className="absolute inset-2 border border-[#C5A880]/30 rounded-xl pointer-events-none" />

                <div className="space-y-1">
                  <div className="text-xs font-semibold tracking-widest text-[#5C061E] uppercase">
                    Festival Nacional Danza del Vientre Chile
                  </div>
                  <div className="text-[10px] tracking-wider text-stone-600 uppercase">
                    Santiago &bull; Chile
                  </div>
                  <div className="w-32 h-0.5 bg-[#C5A880] mx-auto mt-2" />
                </div>

                <div className="text-lg sm:text-2xl font-serif font-bold text-[#5C061E] uppercase tracking-wide">
                  {preview.certificateType}
                </div>

                <div className="text-xs sm:text-sm text-stone-700 leading-relaxed max-w-xl mx-auto space-y-2">
                  <p>El Festival Nacional Danza del Vientre Chile</p>
                  <p>
                    {preview.certificateType === 'CERTIFICADO DE PARTICIPACIÓN'
                      ? 'certifica la participación de'
                      : preview.mode === 'group'
                      ? 'otorga el presente reconocimiento a'
                      : 'otorga el presente reconocimiento a'}
                  </p>
                  <p className="text-xl sm:text-2xl font-serif font-bold text-stone-900 py-1">
                    {preview.subject.displayName}
                  </p>
                  {preview.organizationName && (
                    <p className="text-xs sm:text-sm text-stone-600">
                      representando a <strong className="text-stone-800">{preview.organizationName}</strong>
                    </p>
                  )}
                  <p>
                    {preview.family === 'guest'
                      ? (preview.mode === 'group'
                        ? 'por su participación como agrupación invitada en el Festival Nacional Danza del Vientre Chile 2026,'
                        : 'por su participación como invitada en el Festival Nacional Danza del Vientre Chile 2026,')
                      : 'en el Festival Nacional Danza del Vientre Chile 2026,'}
                  </p>
                  <p>realizado el 5 de septiembre de 2026 en Ñuñoa, Santiago de Chile.</p>
                </div>

                <div className="pt-4 border-t border-stone-200/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-left text-xs text-stone-600">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrUrl}
                      alt={`QR Preview ${preview.previewCode}`}
                      className="w-14 h-14 bg-white rounded-lg p-1 border border-stone-200"
                    />
                    <div className="space-y-0.5 text-[11px]">
                      <div className="font-semibold text-stone-800">Verifica en CulturaGO</div>
                      <div className="font-mono text-stone-600">{preview.previewCode}</div>
                      <div className="text-rose-700 font-medium">[VISTA PREVIA]</div>
                    </div>
                  </div>

                  <div className="text-center sm:text-right space-y-0.5">
                    <div className="w-36 h-0.5 bg-stone-300 mx-auto sm:ml-auto sm:mr-0 mb-1" />
                    <div className="font-semibold text-stone-800">Dirección y Organización</div>
                    <div className="text-[11px] text-stone-600">Festival Nacional Danza del Vientre Chile</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Verification Guarantee & CulturaGO Platform Note */}
            <div className="rounded-2xl bg-stone-50/70 border border-stone-200/80 p-5 space-y-3 text-xs sm:text-sm text-stone-700">
              <div className="flex items-center gap-2 font-semibold text-stone-900">
                <CheckCircle2 className="w-4 h-4 text-[#5C061E]" />
                <span>Garantía de Verificación Digital CulturaGO</span>
              </div>
              <p className="leading-relaxed text-stone-600">
                Esta credencial forma parte del pasaporte cultural digital de CulturaGO. Al emitirse de forma definitiva,
                la autenticidad de este reconocimiento podrá comprobarse públicamente escaneando el código QR
                o accediendo a la dirección única de verificación, garantizando:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-medium text-xs text-stone-800">
                <div className="p-2.5 rounded-xl bg-white border border-stone-200 text-center">
                  &bull; Credencial Activa
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-stone-200 text-center">
                  &bull; Emisor Validado
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-stone-200 text-center">
                  &bull; Integridad Verificada
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-stone-200 text-center">
                  &bull; Registro Inalterable
                </div>
              </div>
            </div>

            {/* CTAs (Mobile-First, Large Touch Targets) */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <a
                  href={pdfDownloadUrl}
                  download
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#5C061E] hover:bg-[#4A0518] text-white font-semibold text-sm transition-colors shadow-xs"
                >
                  <Download className="w-4 h-4" />
                  Descargar Certificado PDF (A4)
                </a>

                <a
                  href={pdfViewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-white hover:bg-stone-50 text-stone-800 border border-stone-300 font-medium text-sm transition-colors"
                >
                  <Eye className="w-4 h-4 text-stone-500" />
                  Abrir PDF en Navegador
                </a>
              </div>

              <a
                href={qrUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-stone-100 hover:bg-stone-200/80 text-stone-700 font-medium text-xs transition-colors"
              >
                <QrCode className="w-4 h-4 text-stone-500" />
                Ver Código QR de Preview
              </a>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
