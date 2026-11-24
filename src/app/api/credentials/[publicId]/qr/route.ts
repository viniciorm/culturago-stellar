import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { CredentialV2Service } from '@/infrastructure/credentials/v2/CredentialV2Service';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await params;
  const service = new CredentialV2Service();
  const credential = await service.getCredentialByPublicId(publicId);

  if (!credential) {
    return NextResponse.json({ error: 'not_found', message: `Credential '${publicId}' not found` }, { status: 404 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://culturago.cl';
  const verifyUrl = `${base}/credentials/${encodeURIComponent(publicId)}`;

  const urlObj = new URL(request.url);
  const format = urlObj.searchParams.get('format');

  if (format === 'png') {
    const pngBuffer = await QRCode.toBuffer(verifyUrl, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
    });
    return new NextResponse(new Uint8Array(pngBuffer), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  }

  const svg = await QRCode.toString(verifyUrl, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
  });

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
