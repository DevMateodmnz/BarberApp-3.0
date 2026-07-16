import { NextResponse } from 'next/server';
import { getPublicWebRuntime } from '@/lib/config/publicRuntime';

export async function POST(request: Request) {
  const runtime = getPublicWebRuntime();
  const url = new URL(request.url);
  const rawBody = await request.text();

  const upstream = await fetch(
    `${runtime.apiBaseUrl}/webhooks/mercado-pago${url.search}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('content-type') ?? 'application/json',
        ...(request.headers.get('x-signature')
          ? { 'x-signature': request.headers.get('x-signature')! }
          : {}),
        ...(request.headers.get('x-request-id')
          ? { 'x-request-id': request.headers.get('x-request-id')! }
          : {}),
      },
      body: rawBody,
      cache: 'no-store',
    }
  );

  const body = await upstream.text();

  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}
