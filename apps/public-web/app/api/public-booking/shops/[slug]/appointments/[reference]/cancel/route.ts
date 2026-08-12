import { NextResponse } from 'next/server';
import {
  PublicApiError,
  requestPublicApi,
} from '@/lib/api/server';
import type {
  PublicCancelBookingPayload,
  PublicCancelBookingResult,
} from '@/lib/api/types';

interface RouteContext {
  params: Promise<{
    slug: string;
    reference: string;
  }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { slug, reference } = await context.params;

  let payload: PublicCancelBookingPayload = {};
  try {
    const text = await request.text();
    payload = text ? (JSON.parse(text) as PublicCancelBookingPayload) : {};
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body must be valid JSON',
        },
      },
      { status: 400 }
    );
  }

  try {
    const { response, payload: apiPayload } =
      await requestPublicApi<PublicCancelBookingResult>(
        `/public/barbershops/${encodeURIComponent(slug)}/appointments/${encodeURIComponent(reference)}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

    if (!response.ok || !apiPayload.success || apiPayload.data === undefined) {
      throw new PublicApiError(
        response.status,
        apiPayload.error?.code ?? 'PUBLIC_API_ERROR',
        apiPayload.error?.message ?? 'Public cancel request failed',
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
