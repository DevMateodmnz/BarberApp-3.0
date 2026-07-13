import { NextResponse } from 'next/server';
import {
  PublicApiError,
  requestPublicApi,
} from '@/lib/api/server';
import type {
  PublicBookingConfirmation,
  PublicCreateAppointmentPayload,
} from '@/lib/api/types';

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim();

  if (!idempotencyKey) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Idempotency-Key header is required',
        },
      },
      { status: 400 }
    );
  }

  const payload = (await request.json()) as PublicCreateAppointmentPayload;

  try {
    const { response, payload: apiPayload } =
      await requestPublicApi<PublicBookingConfirmation>(
        `/public/barbershops/${encodeURIComponent(slug)}/appointments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(payload),
        }
      );

    if (!response.ok || !apiPayload.success || apiPayload.data === undefined) {
      throw new PublicApiError(
        response.status,
        apiPayload.error?.code ?? 'PUBLIC_API_ERROR',
        apiPayload.error?.message ?? 'Public API request failed',
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
