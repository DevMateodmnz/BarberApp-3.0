import { NextResponse } from 'next/server';
import { PublicApiError, getPublicBarbers } from '@/lib/api/server';

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const url = new URL(request.url);
  const serviceId = url.searchParams.get('serviceId')?.trim();

  if (!serviceId) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'serviceId is required',
        },
      },
      { status: 400 }
    );
  }

  try {
    const data = await getPublicBarbers(slug, serviceId);
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
