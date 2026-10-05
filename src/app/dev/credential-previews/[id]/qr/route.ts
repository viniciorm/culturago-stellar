import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getPreviewCase } from '@/fixtures/fdvc2026-previews';

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

  const urlObj = new URL(request.url);
  const format = urlObj.searchParams.get('format');

  if (format === 'png') {
    const pngBuffer = await QRCode.toBuffer(previewUrl, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
    });
    return new NextResponse(new Uint8Array(pngBuffer), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    });
  }

  const svg = await QRCode.toString(previewUrl, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
  });

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
