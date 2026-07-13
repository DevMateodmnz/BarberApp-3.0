import { NextResponse } from 'next/server';
import { PublicApiError, getPublicBookingConfig } from '@/lib/api/server';

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;

  try {
    const data = await getPublicBookingConfig(slug);
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
