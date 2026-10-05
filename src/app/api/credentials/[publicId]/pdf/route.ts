import { NextResponse } from 'next/server';
import { CredentialV2Service } from '@/infrastructure/credentials/v2/CredentialV2Service';
import { buildCredentialV2Pdf } from '@/infrastructure/credentials/v2/pdfCertificate';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await params;
  const service = new CredentialV2Service();
  const credential = await service.getCredentialByPublicId(publicId);

  if (!credential) {
    return NextResponse.json(
      { error: 'not_found', message: `Credential '${publicId}' not found` },
      { status: 404 }
    );
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://culturago.cl';
  const verifyUrl = `${base}/credentials/${encodeURIComponent(publicId)}`;

  const pdfBuffer = buildCredentialV2Pdf(credential, verifyUrl);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="culturago-credential-${publicId}.pdf"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
