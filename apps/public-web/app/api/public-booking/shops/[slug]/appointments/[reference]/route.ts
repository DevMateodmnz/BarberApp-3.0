import { NextResponse } from 'next/server';
import {
  PublicApiError,
  requestPublicApi,
} from '@/lib/api/server';
import type { PublicBookingConfirmation } from '@/lib/api/types';

interface RouteContext {
  params: Promise<{
    slug: string;
    reference: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { slug, reference } = await context.params;

  try {
    const { response, payload: apiPayload } =
      await requestPublicApi<PublicBookingConfirmation>(
        `/public/barbershops/${encodeURIComponent(slug)}/appointments/${encodeURIComponent(reference)}`
      );

    if (!response.ok || !apiPayload.success || apiPayload.data === undefined) {
      throw new PublicApiError(
        response.status,
        apiPayload.error?.code ?? 'PUBLIC_API_ERROR',
        apiPayload.error?.message ?? 'Public booking confirmation request failed',
        apiPayload.error?.details
      );
    }

    return NextResponse.json(
      { success: true, data: apiPayload.data },
      { status: response.status }
    );
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
