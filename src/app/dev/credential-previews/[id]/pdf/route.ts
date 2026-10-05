import { NextResponse } from 'next/server';
import { getPreviewCase } from '@/fixtures/fdvc2026-previews';
import { buildFdvc2026PreviewPdf } from '@/infrastructure/credentials/v2/previewPdfCertificate';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const preview = getPreviewCase(id);

  if (!preview) {
    return NextResponse.json({ error: 'not_found', message: `Preview '${id}' not found` }, { status: 404 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
  const previewUrl = `${base}/dev/credential-previews/${encodeURIComponent(id)}`;

  const pdfBuffer = buildFdvc2026PreviewPdf(preview, previewUrl);

  const urlObj = new URL(request.url);
  const inline = urlObj.searchParams.get('inline') === 'true';

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${id}-certificado.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
