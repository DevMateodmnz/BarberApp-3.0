import { NextResponse } from 'next/server';
import { PublicApiError, getPublicPaymentStatus } from '@/lib/api/server';

interface RouteContext {
  params: Promise<{
    slug: string;
    reference: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { slug, reference } = await context.params;

  try {
    const data = await getPublicPaymentStatus({ slug, publicReference: reference });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof PublicApiError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        { status: error.status }
      );
    }

    throw error;
  }
}
