import React from 'react';
import { notFound } from 'next/navigation';
import {
  AlertTriangle,
  Award,
  Building,
  Calendar,
  ChevronDown,
  Clock,
  Download,
  Info,
  Layers,
  MapPin,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  User,
  XCircle,
} from 'lucide-react';
import { PublicLayout } from '@/components/PublicLayout';
import {
  CredentialV2Service,
  type PublicCredentialView,
} from '@/infrastructure/credentials/v2/CredentialV2Service';
import {
  applySyntheticDevDemoVariant,
  isDevEnvironmentForPublicDemo,
  recomputePresentedDigestV2,
  verifyPresentedCredentialV2,
  type PublicVerificationStateV2,
} from '@/infrastructure/credentials/v2/publicVerification';

export const dynamic = 'force-dynamic';

const ROLE_LABELS_ES: Record<string, string> = {
  dancer: 'Bailarina / Intérprete',
  teacher: 'Profesora',
  director: 'Directora',
  group_leader: 'Líder de grupo',
  photographer: 'Fotógrafo Oficial',
  cameraman: 'Camarógrafo Oficial',
  production: 'Producción',
  organizer: 'Organización',
};

function formatRoleLabelEs(role: string): string {
  return ROLE_LABELS_ES[role] ?? role;
}

interface StatusPresentationConfig {
  badgeClasses: string;
  panelClasses: string;
  explanation: string;
  icon: React.ReactNode;
}

function getVerificationPresentation(
  state: PublicVerificationStateV2
): StatusPresentationConfig {
  switch (state) {
    case 'confirmed':
      return {
        badgeClasses:
          'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold',
        panelClasses: 'bg-emerald-50/70 border-emerald-200 text-emerald-950',
        explanation:
          'La huella SHA-256 recalculada desde los datos cubiertos presentados en esta ficha coincide byte a byte (32 bytes) con el registro confirmado leído desde Stellar Testnet.',
        icon: <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />,
      };
    case 'mismatch':
      return {
        badgeClasses: 'bg-rose-50 border-rose-200 text-rose-800 font-semibold',
        panelClasses: 'bg-rose-50/70 border-rose-200 text-rose-950',
        explanation:
          'La huella SHA-256 recalculada desde el contenido presentado en esta ficha no coincide con el registro de 32 bytes leído desde Stellar Testnet.',
        icon: <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />,
      };
    case 'revoked':
      return {
        badgeClasses: 'bg-rose-50 border-rose-200 text-rose-700 font-semibold',
        panelClasses: 'bg-rose-50/70 border-rose-200 text-rose-950',
        explanation:
          'Esta credencial figura como revocada y ya no se encuentra vigente.',
        icon: <XCircle className="w-5 h-5 text-rose-600 shrink-0" />,
      };
    case 'pending':
      return {
        badgeClasses:
          'bg-amber-50 border-amber-300 text-amber-900 font-semibold',
        panelClasses: 'bg-amber-50/70 border-amber-200 text-amber-950',
        explanation:
          'Existe una operación de emisión en curso o pendiente de confirmación en Stellar Testnet. Este estado no invalida la credencial ni equivale a una coincidencia confirmada.',
        icon: <Clock className="w-5 h-5 text-amber-700 shrink-0" />,
      };
    case 'absent':
      return {
        badgeClasses:
          'bg-amber-50 border-amber-300 text-amber-900 font-semibold',
        panelClasses: 'bg-amber-50/70 border-amber-200 text-amber-950',
        explanation:
          'La consulta de solo lectura a Stellar Testnet respondió válidamente sin encontrar un registro activo para el identificador V2 de esta credencial.',
        icon: <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />,
      };
    case 'unavailable':
      return {
        badgeClasses:
          'bg-stone-100 border-stone-300 text-stone-800 font-semibold',
        panelClasses: 'bg-stone-100/80 border-stone-300 text-stone-900',
        explanation:
          'No se pudo completar una lectura válida del contrato en Stellar Testnet en este momento (fallo de consulta RPC o respuesta inválida). Este estado temporal no invalida la credencial ni confirma coincidencia.',
        icon: <RefreshCw className="w-5 h-5 text-stone-600 shrink-0" />,
      };
    case 'draft':
      return {
        badgeClasses:
          'bg-stone-100 border-stone-300 text-stone-700 font-medium',
        panelClasses: 'bg-stone-50 border-stone-200 text-stone-800',
        explanation:
          'Este registro corresponde a un borrador local en CulturaGO y aún no ha sido emitido ni registrado en Stellar Testnet.',
        icon: <Clock className="w-5 h-5 text-stone-500 shrink-0" />,
      };
    case 'local':
    default:
      return {
        badgeClasses:
          'bg-stone-100 border-stone-300 text-stone-700 font-medium',
        panelClasses: 'bg-stone-50 border-stone-200 text-stone-800',
        explanation:
          'Esta credencial se encuentra registrada localmente en CulturaGO sin una operación de anclaje confirmada en Stellar Testnet.',
        icon: <Clock className="w-5 h-5 text-stone-500 shrink-0" />,
      };
  }
}

export async function CredentialV2PublicView({
  credential,
  demoModeParam,
}: {
  credential: PublicCredentialView;
  demoModeParam?: string | null;
}) {
  const isDev = isDevEnvironmentForPublicDemo();
  const demoResolution = applySyntheticDevDemoVariant(
    credential,
    demoModeParam
  );
  const effectiveView = demoResolution.view;

  // Ensure single-source integrity: if a synthetic DEV variant is active OR if the
  // presented view fields diverge from the precomputed verification digest, re-verify
  // directly from `effectiveView` so display and digest calculation never diverge.
  const currentCheck = recomputePresentedDigestV2(effectiveView);
  const needsLiveReverification =
    demoResolution.activeDemoMode !== null ||
    !effectiveView.stellar ||
    effectiveView.stellar.recomputedDigest !== currentCheck.recomputedDigest;

  const { presentedPayload, stellar } = needsLiveReverification
    ? await verifyPresentedCredentialV2(
        effectiveView,
        effectiveView.historicalOperation ??
          (effectiveView.stellar
            ? {
                phase: effectiveView.stellar.phase,
                txHash: effectiveView.stellar.txHash,
                ledger:
                  effectiveView.stellar.historicalLedger ??
                  effectiveView.stellar.ledger,
                expectedDigest: effectiveView.stellar.historicalExpectedDigest,
              }
            : null),
        {
          simulateUnavailableForSyntheticDemo:
            demoResolution.activeDemoMode === 'unavailable',
        }
      )
    : {
        presentedPayload: currentCheck.presentedPayload,
        stellar: effectiveView.stellar!,
      };

  const statusUi = getVerificationPresentation(stellar.verificationState);
  const qrUrl = `/api/credentials/${encodeURIComponent(presentedPayload.public_id)}/qr`;
  const pdfUrl = `/api/credentials/${encodeURIComponent(presentedPayload.public_id)}/pdf`;

  // Render every covered field strictly from `presentedPayload` (the exact object hashed)
  const subjectDisplayName = presentedPayload.subject.artistic_name
    ? `${presentedPayload.subject.display_name} ("${presentedPayload.subject.artistic_name}")`
    : presentedPayload.subject.display_name;

  // Pair covered evidence items with optional non-covered descriptive notes
  const notesByKey = new Map<string, { id: string; notes: string | null }>();
  for (const ev of effectiveView.evidences) {
    const key = `${ev.sourceType}|${ev.sourceId}|${ev.evidenceRole}`;
    if (!notesByKey.has(key)) {
      notesByKey.set(key, { id: ev.id, notes: ev.notes ?? null });
    }
  }
  const hasAdditionalEvidenceNotes = effectiveView.evidences.some((ev) =>
    Boolean(ev.notes)
  );

  const openDetailsByDefault =
    demoResolution.activeDemoMode !== null ||
    stellar.verificationState === 'mismatch' ||
    stellar.verificationState === 'unavailable';

  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto space-y-8 pb-12">
        {/* Environment banner if dev */}
        {isDev && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-2 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-wide uppercase px-2 py-0.5 rounded-md bg-amber-200 text-amber-950 text-xs">
                  DEV
                </span>
                <span>
                  Ambiente de Desarrollo / Pruebas — CulturaGO Stellar Testnet
                </span>
              </div>
              <span className="text-xs text-amber-700 font-mono">
                {presentedPayload.public_id}
              </span>
            </div>
            {demoResolution.activeDemoMode === 'mismatch' && (
              <div
                data-testid="dev-synthetic-demo-banner"
                className="text-xs rounded-lg bg-amber-100/90 border border-amber-300 p-2.5 text-amber-950"
              >
                <strong>Variante sintética de demostración (Caso 2 — Discrepancia):</strong>{' '}
                se alteró en memoria el campo visible cubierto{' '}
                <code className="font-mono font-semibold">
                  {demoResolution.alteredField}
                </code>{' '}
                (valor original:{' '}
                <span className="font-mono">
                  &ldquo;{demoResolution.originalValue}&rdquo;
                </span>
                ) sin modificar la base de datos ni el registro en Stellar
                Testnet.
              </div>
            )}
            {demoResolution.activeDemoMode === 'unavailable' && (
              <div
                data-testid="dev-synthetic-demo-banner"
                className="text-xs rounded-lg bg-amber-100/90 border border-amber-300 p-2.5 text-amber-950"
              >
                <strong>Simulación controlada de indisponibilidad (Caso 3 — Indisponibilidad):</strong>{' '}
                fallo de lectura RPC acotado únicamente a esta consulta sintética
                de demostración; la credencial base y el servicio general
                permanecen operativos.
              </div>
            )}
          </div>
        )}

        {/* Status Header */}
        <div className="p-6 rounded-2xl bg-white border border-stone-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-semibold text-stone-600 tracking-wider">
                  Verificación pública de credencial
                </span>
                <span className="text-xs font-mono text-stone-600 px-2 py-0.5 bg-stone-100 rounded-md">
                  {presentedPayload.schema_version}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900">
                {presentedPayload.claim.display_label}
              </h1>
              <p
                data-testid="presented-display-subtitle"
                className="text-stone-600 text-sm sm:text-base"
              >
                {presentedPayload.claim.display_subtitle}
              </p>
            </div>

            <div className="shrink-0">
              <div
                data-testid="public-verification-status"
                data-verification-state={stellar.verificationState}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm ${statusUi.badgeClasses}`}
              >
                {statusUi.icon}
                <span>{stellar.publicStatusLabel}</span>
              </div>
            </div>
          </div>

          <div
            data-testid="public-verification-explanation"
            className={`rounded-xl border p-3.5 text-xs sm:text-sm leading-relaxed ${statusUi.panelClasses}`}
          >
            {statusUi.explanation}
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
              <div
                data-testid="presented-subject-name"
                className="text-2xl sm:text-3xl font-serif font-bold text-stone-900"
              >
                {subjectDisplayName}
              </div>
              {presentedPayload.claim.roles.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-stone-600 font-medium">
                    Rol(es):
                  </span>
                  {presentedPayload.claim.roles.map((r) => (
                    <span
                      key={r}
                      className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#5C061E]/5 text-[#5C061E] border border-[#5C061E]/15"
                    >
                      {formatRoleLabelEs(r)}
                    </span>
                  ))}
                  {presentedPayload.participation_mode && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-stone-100 text-stone-600">
                      Modalidad:{' '}
                      {presentedPayload.participation_mode === 'solo'
                        ? 'Solista'
                        : presentedPayload.participation_mode === 'group'
                          ? 'Grupal'
                          : 'Institucional'}
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
                  {presentedPayload.event.name}
                  {presentedPayload.event.year
                    ? ` (${presentedPayload.event.year})`
                    : ''}
                </div>
                {presentedPayload.event.location && (
                  <div className="text-xs text-stone-600 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {presentedPayload.event.location}
                  </div>
                )}
                {presentedPayload.event.start_date && (
                  <div className="text-xs text-stone-600 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {presentedPayload.event.start_date}
                    {presentedPayload.event.end_date &&
                      ` al ${presentedPayload.event.end_date}`}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <span className="text-xs uppercase font-semibold text-stone-600 tracking-wider flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-[#5C061E]" />
                  Entidad Emisora
                </span>
                <div className="font-semibold text-stone-800 text-lg">
                  {presentedPayload.issuer.display_name}
                </div>
                <div className="text-xs text-stone-600">
                  Tipo:{' '}
                  <span className="font-medium capitalize">
                    {presentedPayload.issuer.kind}
                  </span>
                </div>
                {presentedPayload.claim.organization_name && (
                  <div className="text-xs text-stone-600 pt-1">
                    Agrupación / Escuela:{' '}
                    <span className="font-semibold text-stone-800">
                      {presentedPayload.claim.organization_name}
                    </span>
                  </div>
                )}
                {presentedPayload.claim.presentation_code && (
                  <div className="text-xs text-stone-600">
                    Código de Presentación:{' '}
                    <span className="font-mono font-semibold text-stone-800">
                      {presentedPayload.claim.presentation_code}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Evidences summary */}
            {presentedPayload.claim.evidences.length > 0 && (
              <div className="border-t border-stone-100 pt-6 space-y-3">
                <span className="text-xs uppercase font-semibold text-stone-600 tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-[#5C061E]" />
                  Evidencias de Respaldo ({presentedPayload.claim.evidences.length})
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {presentedPayload.claim.evidences.map((ev, i) => {
                    const extra = notesByKey.get(
                      `${ev.source_type}|${ev.source_id}|${ev.evidence_role}`
                    );
                    return (
                      <div
                        key={extra?.id || `${ev.source_id}-${i}`}
                        className="p-3 rounded-xl bg-stone-50 border border-stone-200/60 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-stone-800 capitalize">
                            {ev.evidence_role}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 bg-white border border-stone-200 rounded-md font-mono text-stone-600">
                            {ev.source_type}
                          </span>
                        </div>
                        <div className="font-mono text-stone-600 text-[11px] truncate">
                          ID: {ev.source_id}
                        </div>
                        {extra?.notes && (
                          <div className="pt-1 border-t border-stone-200/60 text-stone-600 text-[11px] space-y-0.5">
                            <div className="italic">{extra.notes}</div>
                            <div className="text-[10px] text-stone-500">
                              Nota descriptiva complementaria (fuera del digest
                              canónico)
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                  alt={`QR ${presentedPayload.public_id}`}
                  className="w-20 h-20 bg-white rounded-lg p-1 border border-stone-200 shadow-2xs"
                />
                <div className="text-xs space-y-1">
                  <div className="font-semibold text-stone-800">
                    Código QR de consulta
                  </div>
                  <div className="text-stone-600">
                    Escanea para abrir esta ficha pública de verificación
                  </div>
                  <div className="font-mono text-stone-600 text-[11px]">
                    {presentedPayload.public_id}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scope & Proof Limits Disclosure (SOW D3 Criterion 5) */}
        <div
          data-testid="verification-scope-and-limits"
          className="rounded-2xl bg-white border border-stone-200/80 shadow-xs p-6 space-y-3 text-xs sm:text-sm text-stone-700"
        >
          <div className="flex items-center gap-2 text-stone-900 font-semibold text-sm">
            <Info className="w-4 h-4 text-[#5C061E] shrink-0" />
            <span>Alcance y límites de la verificación</span>
          </div>
          <ul className="space-y-2 list-disc pl-5 leading-relaxed">
            <li>
              <strong>Integridad de los datos cubiertos por la huella:</strong>{' '}
              la coincidencia en Stellar Testnet acredita únicamente que los
              campos cubiertos por el esquema canónico{' '}
              <code className="font-mono text-xs bg-stone-100 px-1 py-0.5 rounded">
                culturago.credential.v2
              </code>{' '}
              (identificador público, familia, modalidad, emisor, sujeto,
              evento, reclamo/roles, referencias de evidencia y fecha de
              emisión) mantienen exactamente la misma huella SHA-256 de 32 bytes
              registrada en el contrato.
            </li>
            <li>
              <strong>Respaldo de la participación cultural:</strong> la
              participación o rol cultural descrito es declarado y respaldado
              por la <strong>entidad emisora</strong> ({presentedPayload.issuer.display_name}); la
              comparación criptográfica del hash por sí sola no verifica de
              manera independiente la ocurrencia material del evento.
            </li>
            <li>
              <strong>Límites sobre identidad legal y acreditación del emisor:</strong>{' '}
              este resultado <strong>no certifica la identidad legal civil</strong>{' '}
              de la persona o agrupación ni constituye{' '}
              <strong>acreditación oficial o gubernamental de la autoridad del emisor</strong>.
              Stellar Testnet es una red de pruebas sujeta a expiración TTL y
              reinicios periódicos.
            </li>
            <li>
              <strong>Metadatos adicionales fuera de la huella:</strong>{' '}
              {hasAdditionalEvidenceNotes
                ? 'las notas descriptivas de evidencia visibles arriba, junto con '
                : ''}
              las referencias operativas de auditoría (hash de transacción,
              ledger, huella persistida en base de datos, estado de operación) y
              las representaciones descargables (PDF/QR) son metadatos
              complementarios que no forman parte del cálculo del digest de 32
              bytes.
            </li>
          </ul>
        </div>

        {/* Cryptographic & Technical Integrity Section */}
        <details
          open={openDetailsByDefault}
          className="group rounded-2xl bg-white border border-stone-200/80 shadow-xs overflow-hidden"
        >
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
                <span className="text-stone-600 font-medium">
                  Versión de Esquema:
                </span>
                <div className="font-mono font-semibold text-stone-800 mt-0.5">
                  {presentedPayload.schema_version} (hash_schema = 2)
                </div>
              </div>
              <div>
                <span className="text-stone-600 font-medium">
                  Algoritmo de Canonicalización:
                </span>
                <div className="font-mono font-semibold text-stone-800 mt-0.5">
                  RFC 8785 (JSON Canonicalization Scheme - JCS)
                </div>
              </div>
              <div>
                <span className="text-stone-600 font-medium">
                  Algoritmo de Resumen (Digest):
                </span>
                <div className="font-mono font-semibold text-stone-800 mt-0.5">
                  SHA-256 con Domain Separator
                </div>
              </div>
              <div>
                <span className="text-stone-600 font-medium">
                  Fecha de Emisión (UTC):
                </span>
                <div className="font-mono text-stone-800 mt-0.5">
                  {presentedPayload.issued_at}
                </div>
              </div>
            </div>

            <div>
              <span className="text-stone-600 font-medium">
                Huella recalculada desde el contenido presentado (SHA-256, 32
                bytes):
              </span>
              <div
                data-testid="recomputed-digest"
                className="font-mono break-all p-2.5 rounded-lg bg-stone-100 text-stone-900 border border-stone-200 mt-1 select-all"
              >
                {stellar.recomputedDigest}
              </div>
            </div>

            {stellar.readbackDigest && (
              <div>
                <span className="text-stone-600 font-medium">
                  Digest leído del contrato en Stellar Testnet (32 bytes):
                </span>
                <div
                  data-testid="contract-readback-digest"
                  className={`font-mono break-all p-2.5 rounded-lg border mt-1 select-all ${
                    stellar.digestMatches
                      ? 'bg-emerald-50 text-emerald-950 border-emerald-200'
                      : 'bg-rose-50 text-rose-950 border-rose-200'
                  }`}
                >
                  {stellar.readbackDigest}
                </div>
              </div>
            )}

            <div>
              <span className="text-stone-600 font-medium">
                Huella persistida en base de datos (referencia de auditoría):
              </span>
              <div
                data-testid="persisted-audit-digest"
                className="font-mono break-all p-2.5 rounded-lg bg-stone-100 text-stone-700 border border-stone-200 mt-1 select-all"
              >
                {stellar.persistedDigest}
              </div>
            </div>

            {stellar.confirmed && (
              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div className="font-semibold text-emerald-900">
                  Anclaje Soroban Confirmado (Stellar Testnet)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-stone-800">
                  <div>
                    <span className="text-stone-600 font-medium">
                      Ledger Confirmado:
                    </span>{' '}
                    <span className="font-mono font-semibold">
                      {stellar.ledger}
                    </span>
                  </div>
                  {stellar.contractId && (
                    <div className="break-all">
                      <span className="text-stone-600 font-medium">
                        Contrato:
                      </span>{' '}
                      <span className="font-mono">{stellar.contractId}</span>
                    </div>
                  )}
                </div>
                {stellar.txHash && (
                  <div className="break-all">
                    <span className="text-stone-600 font-medium">Tx Hash:</span>{' '}
                    <span className="font-mono text-stone-900">
                      {stellar.txHash}
                    </span>
                  </div>
                )}
              </div>
            )}

            {!stellar.confirmed &&
              (stellar.txHash ||
                stellar.historicalLedger != null ||
                stellar.contractId ||
                stellar.phase) && (
                <div className="p-3.5 rounded-xl bg-stone-100 border border-stone-200 space-y-1.5 text-stone-800">
                  <div className="font-semibold text-stone-900">
                    Referencias operativas e históricas de auditoría
                  </div>
                  {stellar.phase && (
                    <div>
                      <span className="text-stone-600 font-medium">
                        Fase operación histórica:
                      </span>{' '}
                      <span className="font-mono">{stellar.phase}</span>
                    </div>
                  )}
                  {stellar.historicalLedger != null && (
                    <div>
                      <span className="text-stone-600 font-medium">
                        Ledger histórico registrado:
                      </span>{' '}
                      <span className="font-mono">
                        {stellar.historicalLedger}
                      </span>
                    </div>
                  )}
                  {stellar.contractId && (
                    <div className="break-all">
                      <span className="text-stone-600 font-medium">
                        Contrato consultado:
                      </span>{' '}
                      <span className="font-mono">{stellar.contractId}</span>
                    </div>
                  )}
                  {stellar.txHash && (
                    <div className="break-all">
                      <span className="text-stone-600 font-medium">
                        Tx Hash histórico:
                      </span>{' '}
                      <span className="font-mono">{stellar.txHash}</span>
                    </div>
                  )}
                  {stellar.failureKind && (
                    <div>
                      <span className="text-stone-600 font-medium">
                        Diagnóstico de consulta:
                      </span>{' '}
                      <span className="font-mono">{stellar.failureKind}</span>
                    </div>
                  )}
                </div>
              )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-stone-700">
              <div className="break-all">
                <span className="text-stone-600 font-medium">
                  Identificador V2 (credential_id):
                </span>{' '}
                <span className="font-mono">{stellar.credentialIdHex}</span>
              </div>
              {stellar.scopeIdHex && (
                <div className="break-all">
                  <span className="text-stone-600 font-medium">
                    Alcance V2 (scope_id):
                  </span>{' '}
                  <span className="font-mono">{stellar.scopeIdHex}</span>
                </div>
              )}
            </div>

            <div>
              <span className="text-stone-600 font-medium">
                Canonical Payload Presentado (JSON):
              </span>
              <pre className="mt-1 p-3 rounded-lg bg-stone-900 text-stone-100 font-mono text-[11px] overflow-x-auto max-h-72 select-all leading-relaxed">
                {JSON.stringify(presentedPayload, null, 2)}
              </pre>
            </div>
          </div>
        </details>
      </div>
    </PublicLayout>
  );
}

interface CredentialPageProps {
  params: Promise<{ publicId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CredentialV2PublicPage({
  params,
  searchParams,
}: CredentialPageProps) {
  const { publicId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawDemo = resolvedSearchParams?.demo;
  const demoModeParam = Array.isArray(rawDemo) ? rawDemo[0] : rawDemo;

  const service = new CredentialV2Service();
  const cred = await service.getCredentialByPublicId(publicId);

  if (!cred) {
    notFound();
  }

  return CredentialV2PublicView({ credential: cred, demoModeParam });
}
