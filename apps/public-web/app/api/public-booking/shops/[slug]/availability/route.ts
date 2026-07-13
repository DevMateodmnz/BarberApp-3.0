import { NextResponse } from 'next/server';
import { PublicApiError, getPublicAvailability } from '@/lib/api/server';

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const url = new URL(request.url);
  const serviceId = url.searchParams.get('serviceId')?.trim();
  const barberId = url.searchParams.get('barberId')?.trim();
  const localDate = url.searchParams.get('localDate')?.trim();

  if (!serviceId || !barberId || !localDate) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'serviceId, barberId, and localDate are required',
        },
      },
      { status: 400 }
    );
  }

  try {
    const data = await getPublicAvailability({
      slug,
      barberId,
      serviceId,
      localDate,
    });
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
