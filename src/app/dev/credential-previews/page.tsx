import React from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Download,
  Eye,
  User,
  Users,
  Award,
  ExternalLink,
  Building,
  QrCode,
  FileText,
} from 'lucide-react';
import { PublicLayout } from '@/components/PublicLayout';
import { getAllPreviewCases } from '@/fixtures/fdvc2026-previews';

export default function CredentialPreviewsIndexPage() {
  const cases = getAllPreviewCases();

  return (
    <PublicLayout>
      <div className="max-w-5xl mx-auto space-y-8 pb-16 px-2 sm:px-4">
        {/* Header */}
        <div className="rounded-3xl bg-white border border-stone-200/90 p-6 sm:p-10 shadow-xs space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100/80 border border-amber-300 text-amber-900 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-amber-700" />
            <span>Ambiente de Desarrollo &bull; Motor Credential V2 Congelado</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-4xl font-serif font-bold text-stone-900">
              Previews Funcionales FDVC 2026
            </h1>
            <p className="text-sm sm:text-base text-stone-600 max-w-3xl leading-relaxed">
              Visualización y validación visual de los 4 casos prototípicos del{' '}
              <strong>Festival Nacional Danza del Vientre Chile 2026</strong>.
              Esta vista permite evaluar la experiencia de usuario, redacción cultural y el diseño del
              certificado en formato A4 horizontal antes de la emisión real.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap gap-3 text-xs text-stone-600 border-t border-stone-100">
            <span className="font-semibold text-stone-800">Estado operativo:</span>
            <span>&bull; 0 inserts en PostgreSQL</span>
            <span>&bull; 0 mutaciones on-chain</span>
            <span>&bull; 0 credenciales emitidas</span>
            <span>&bull; Datos 100% de preview</span>
          </div>
        </div>

        {/* 4 Preview Cases Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cases.map((c) => {
            const detailUrl = `/dev/credential-previews/${c.id}`;
            const pdfDownloadUrl = `/dev/credential-previews/${c.id}/pdf`;
            const pdfViewUrl = `/dev/credential-previews/${c.id}/pdf?inline=true`;
            const qrUrl = `/dev/credential-previews/${c.id}/qr`;

            const isGroup = c.mode === 'group';
            const isGuest = c.family === 'guest';

            return (
              <div
                key={c.id}
                className="rounded-3xl bg-white border border-stone-200/90 shadow-sm overflow-hidden flex flex-col justify-between transition-all hover:shadow-md"
              >
                <div>
                  {/* Card top banner */}
                  <div
                    className={`h-2.5 ${
                      isGuest
                        ? 'bg-linear-to-r from-[#8A1434] to-[#C5A880]'
                        : 'bg-linear-to-r from-[#5C061E] to-[#8A1434]'
                    }`}
                  />

                  <div className="p-6 sm:p-7 space-y-4">
                    {/* Header badges */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-stone-100 text-stone-800 border border-stone-200">
                        CASO {c.caseLetter}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                          isGuest
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        {c.displayLabel}
                      </span>
                    </div>

                    {/* Title & Subject */}
                    <div className="space-y-1">
                      <div className="text-xs uppercase font-medium tracking-wider text-stone-600">
                        {c.caseTitle} &bull; {c.presentationCode}
                      </div>
                      <h2 className="text-xl sm:text-2xl font-serif font-bold text-stone-900">
                        {c.subject.displayName}
                      </h2>
                    </div>

                    {/* Metadata items */}
                    <div className="space-y-1.5 text-xs text-stone-600 pt-1">
                      {c.organizationName ? (
                        <div className="flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                          <span>
                            Escuela: <strong className="text-stone-800">{c.organizationName}</strong>
                          </span>
                        </div>
                      ) : (
                        <div className="text-stone-600 italic">Sin agrupación / Artista individual</div>
                      )}
                      <div className="flex items-center gap-1.5">
                        {isGroup ? (
                          <Users className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                        ) : (
                          <User className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                        )}
                        <span>Modalidad: {isGroup ? 'Grupal' : 'Solista'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                        <span>Tipo de Certificado: {c.certificateType}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="p-6 sm:p-7 pt-0 border-t border-stone-100 flex flex-col gap-2.5 bg-stone-50/50">
                  <Link
                    href={detailUrl}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#5C061E] hover:bg-[#4A0518] text-white text-sm font-semibold transition-colors shadow-2xs"
                  >
                    <span>Ver Página Pública de Preview</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>

                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={pdfViewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-stone-50 text-stone-800 border border-stone-300 text-xs font-medium transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5 text-stone-500" />
                      <span>Ver PDF A4</span>
                    </a>

                    <a
                      href={pdfDownloadUrl}
                      download
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-stone-50 text-stone-800 border border-stone-300 text-xs font-medium transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-stone-500" />
                      <span>Descargar PDF</span>
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PublicLayout>
  );
}
