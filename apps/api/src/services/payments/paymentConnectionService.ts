import crypto from 'node:crypto';
import { AppError } from '../../lib/errors.js';
import { decryptPaymentSecret, encryptPaymentSecret, randomOpaqueToken, sha256Hex } from '../../lib/payments/crypto.js';
import { readPaymentRuntimeConfig } from '../../lib/payments/runtime.js';
import { prisma } from '../../lib/prisma.js';
import {
  buildMercadoPagoAuthorizationUrl,
  exchangeMercadoPagoAuthorizationCode,
  refreshMercadoPagoAuthorization,
} from './providers/mercadoPagoClient.js';

const runtime = readPaymentRuntimeConfig(process.env);
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const SAFE_REDIRECT_TARGET_PATTERN = /^\/(?!\/)(?!.*(?:\.\.|javascript:)).*$/i;

export interface PaymentConnectionDto {
  provider: 'MERCADO_PAGO';
  status:
    | 'DISCONNECTED'
    | 'CONNECTING'
    | 'CONNECTED'
    | 'REFRESH_REQUIRED'
    | 'REVOKED'
    | 'ERROR';
  sellerId: string | null;
  publicKeyPresent: boolean;
  connectedAt: string | null;
  lastRefreshedAt: string | null;
  revokedAt: string | null;
  lastErrorCode: string | null;
}

export async function ensurePaymentConnection(barbershopId: string) {
  const existing = await prisma.barbershopPaymentConnection.findUnique({
    where: {
      barbershopId_provider: {
        barbershopId,
        provider: 'MERCADO_PAGO',
      },
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.barbershopPaymentConnection.create({
    data: {
      barbershopId,
      provider: 'MERCADO_PAGO',
      status: 'DISCONNECTED',
    },
  });
}

function mapConnectionDto(connection: Awaited<ReturnType<typeof ensurePaymentConnection>>): PaymentConnectionDto {
  return {
    provider: 'MERCADO_PAGO',
    status: connection.status,
    sellerId: connection.providerSellerId,
    publicKeyPresent: Boolean(connection.providerPublicKey),
    connectedAt: connection.connectedAt?.toISOString() ?? null,
    lastRefreshedAt: connection.lastRefreshedAt?.toISOString() ?? null,
    revokedAt: connection.revokedAt?.toISOString() ?? null,
    lastErrorCode: connection.lastErrorCode,
  };
}

export async function getPaymentConnection(barbershopId: string): Promise<PaymentConnectionDto> {
  return mapConnectionDto(await ensurePaymentConnection(barbershopId));
}

function buildPkceChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function normalizeRedirectTarget(value?: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return null;
  }

  if (!SAFE_REDIRECT_TARGET_PATTERN.test(trimmed)) {
    throw new AppError(400, 'PAYMENT_OAUTH_INVALID_REDIRECT', 'Redirect target is not allowed');
  }

  return trimmed;
}

export async function startMercadoPagoConnect(input: {
  barbershopId: string;
  userId: string;
  redirectTarget?: string | null;
}) {
  const redirectTarget = normalizeRedirectTarget(input.redirectTarget);
  const state = randomOpaqueToken(24);
  const stateHash = sha256Hex(state);
  const verifier = randomOpaqueToken(48);
  const codeChallenge = buildPkceChallenge(verifier);
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.paymentOAuthState.deleteMany({
      where: {
        barbershopId: input.barbershopId,
        initiatedByUserId: input.userId,
        provider: 'MERCADO_PAGO',
      },
    });

    await tx.barbershopPaymentConnection.upsert({
      where: {
        barbershopId_provider: {
          barbershopId: input.barbershopId,
          provider: 'MERCADO_PAGO',
        },
      },
      create: {
        barbershopId: input.barbershopId,
        provider: 'MERCADO_PAGO',
        status: 'CONNECTING',
      },
      update: {
        status: 'CONNECTING',
        lastErrorCode: null,
      },
    });

    await tx.paymentOAuthState.create({
      data: {
        barbershopId: input.barbershopId,
        initiatedByUserId: input.userId,
        provider: 'MERCADO_PAGO',
        stateHash,
        pkceVerifierCiphertext: encryptPaymentSecret(verifier, runtime.encryptionKey),
        redirectTarget,
        expiresAt,
      },
    });
  });

  return {
    authorizationUrl: buildMercadoPagoAuthorizationUrl({
      runtime,
      state,
      codeChallenge,
    }),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function handleMercadoPagoOAuthCallback(input: {
  code?: string | null;
  state?: string | null;
  error?: string | null;
}) {
  if (input.error) {
    return {
      ok: false as const,
      title: 'No se pudo conectar Mercado Pago',
      message: 'Mercado Pago devolvió un error durante la autorización. Volvé a BarberApp e intentá nuevamente.',
      redirectTarget: null,
    };
  }

  if (!input.code || !input.state) {
    throw new AppError(400, 'PAYMENT_OAUTH_INVALID_CALLBACK', 'Missing Mercado Pago OAuth callback parameters');
  }

  const stateHash = sha256Hex(input.state);
  const now = new Date();

  const oauthState = await prisma.paymentOAuthState.findUnique({
    where: { stateHash },
    include: {
      barbershop: {
        select: {
          id: true,
          ownerId: true,
          name: true,
        },
      },
    },
  });

  if (!oauthState || oauthState.expiresAt.getTime() <= now.getTime() || oauthState.consumedAt) {
    throw new AppError(400, 'PAYMENT_OAUTH_STATE_INVALID', 'The Mercado Pago authorization request expired or was already used');
  }

  if (oauthState.barbershop.ownerId !== oauthState.initiatedByUserId) {
    throw new AppError(403, 'PAYMENT_OAUTH_OWNER_MISMATCH', 'The initiating owner can no longer connect this barbershop');
  }

  const verifier = decryptPaymentSecret(oauthState.pkceVerifierCiphertext, runtime.encryptionKey);
  const tokenResult = await exchangeMercadoPagoAuthorizationCode({
    runtime,
    code: input.code,
    codeVerifier: verifier,
  });

  if (!tokenResult.accessToken || !tokenResult.refreshToken || !tokenResult.sellerId) {
    throw new AppError(502, 'PAYMENT_PROVIDER_INVALID_RESPONSE', 'Mercado Pago did not return OAuth credentials');
  }

  const tokenExpiresAt = tokenResult.expiresInSeconds
    ? new Date(now.getTime() + tokenResult.expiresInSeconds * 1000)
    : null;

  await prisma.$transaction(async (tx) => {
    const consumed = await tx.paymentOAuthState.updateMany({
      where: {
        id: oauthState.id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (consumed.count === 0) {
      throw new AppError(400, 'PAYMENT_OAUTH_STATE_INVALID', 'The Mercado Pago authorization request expired or was already used');
    }

    await tx.barbershopPaymentConnection.upsert({
      where: {
        barbershopId_provider: {
          barbershopId: oauthState.barbershopId,
          provider: 'MERCADO_PAGO',
        },
      },
      create: {
        barbershopId: oauthState.barbershopId,
        provider: 'MERCADO_PAGO',
        status: 'CONNECTED',
        providerSellerId: tokenResult.sellerId,
        providerPublicKey: tokenResult.publicKey,
        accessTokenCiphertext: encryptPaymentSecret(tokenResult.accessToken, runtime.encryptionKey),
        refreshTokenCiphertext: encryptPaymentSecret(tokenResult.refreshToken, runtime.encryptionKey),
        tokenExpiresAt,
        scopes: tokenResult.scope,
        connectedAt: now,
        lastRefreshedAt: now,
        revokedAt: null,
        lastErrorCode: null,
      },
      update: {
        status: 'CONNECTED',
        providerSellerId: tokenResult.sellerId,
        providerPublicKey: tokenResult.publicKey,
        accessTokenCiphertext: encryptPaymentSecret(tokenResult.accessToken, runtime.encryptionKey),
        refreshTokenCiphertext: encryptPaymentSecret(tokenResult.refreshToken, runtime.encryptionKey),
        tokenExpiresAt,
        scopes: tokenResult.scope,
        connectedAt: now,
        lastRefreshedAt: now,
        revokedAt: null,
        lastErrorCode: null,
      },
    });
  });

  return {
    ok: true as const,
    title: 'Mercado Pago conectado',
    message: `La cuenta de ${oauthState.barbershop.name} quedó conectada. Volvé a BarberApp y actualizá el estado.`,
    redirectTarget: oauthState.redirectTarget,
  };
}

export async function disconnectPaymentConnection(barbershopId: string) {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.barbershopPaymentConnection.upsert({
      where: {
        barbershopId_provider: {
          barbershopId,
          provider: 'MERCADO_PAGO',
        },
      },
      create: {
        barbershopId,
        provider: 'MERCADO_PAGO',
        status: 'REVOKED',
        revokedAt: now,
      },
      update: {
        status: 'REVOKED',
        providerSellerId: null,
        providerPublicKey: null,
        accessTokenCiphertext: null,
        refreshTokenCiphertext: null,
        tokenExpiresAt: null,
        scopes: null,
        revokedAt: now,
        lastErrorCode: null,
      },
    });

    await tx.barbershopDepositPolicy.upsert({
      where: { barbershopId },
      create: {
        barbershopId,
        mode: 'DISABLED',
        holdDurationMinutes: 15,
        currency: 'ARS',
      },
      update: {
        mode: 'DISABLED',
        fixedAmountCents: null,
        percentageBasisPoints: null,
      },
    });
  });
}

export async function getOperationalMercadoPagoCredentials(barbershopId: string) {
  const connection = await ensurePaymentConnection(barbershopId);
  if (connection.status !== 'CONNECTED' || !connection.accessTokenCiphertext || !connection.refreshTokenCiphertext) {
    throw new AppError(409, 'PAYMENT_CONNECTION_NOT_OPERATIONAL', 'Mercado Pago connection is not operational');
  }

  const now = new Date();
  if (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > now.getTime() + 5 * 60_000) {
    return {
      connectionId: connection.id,
      accessToken: decryptPaymentSecret(connection.accessTokenCiphertext, runtime.encryptionKey),
      sellerId: connection.providerSellerId,
      publicKey: connection.providerPublicKey,
    };
  }

  const refreshed = await refreshMercadoPagoAuthorization({
    runtime,
    refreshToken: decryptPaymentSecret(connection.refreshTokenCiphertext, runtime.encryptionKey),
  });

  if (!refreshed.accessToken || !refreshed.refreshToken) {
    await prisma.barbershopPaymentConnection.update({
      where: { id: connection.id },
      data: {
        status: 'REFRESH_REQUIRED',
        lastErrorCode: 'REFRESH_FAILED',
      },
    });
    throw new AppError(409, 'PAYMENT_CONNECTION_REFRESH_REQUIRED', 'Mercado Pago requires reconnection');
  }

  const refreshedAt = new Date();
  const tokenExpiresAt = refreshed.expiresInSeconds
    ? new Date(refreshedAt.getTime() + refreshed.expiresInSeconds * 1000)
    : null;

  const updated = await prisma.barbershopPaymentConnection.update({
    where: { id: connection.id },
    data: {
      status: 'CONNECTED',
      providerSellerId: refreshed.sellerId ?? connection.providerSellerId,
      providerPublicKey: refreshed.publicKey ?? connection.providerPublicKey,
      accessTokenCiphertext: encryptPaymentSecret(refreshed.accessToken, runtime.encryptionKey),
      refreshTokenCiphertext: encryptPaymentSecret(refreshed.refreshToken, runtime.encryptionKey),
      tokenExpiresAt,
      scopes: refreshed.scope ?? connection.scopes,
      lastRefreshedAt: refreshedAt,
      lastErrorCode: null,
    },
  });

  return {
    connectionId: updated.id,
    accessToken: refreshed.accessToken,
    sellerId: updated.providerSellerId,
    publicKey: updated.providerPublicKey,
  };
}

export function renderPaymentOAuthCompletionPage(input: {
  title: string;
  message: string;
  success: boolean;
  redirectTarget?: string | null;
}) {
  const title = escapeHtml(input.title);
  const message = escapeHtml(input.message);
  const accent = input.success ? '#166534' : '#991b1b';
  const redirectTarget = normalizeRedirectTarget(input.redirectTarget);
  const actionLink = redirectTarget
    ? `<p style="margin-top:20px"><a href="${escapeHtml(redirectTarget)}" style="color:${accent}; font-weight:700; text-decoration:none;">Volver a BarberApp</a></p>`
    : '';

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="font-family: system-ui, sans-serif; background: #0f172a; color: white; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 24px;">
    <main style="max-width: 560px; background: #111827; border: 1px solid #1f2937; border-radius: 20px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,.35);">
      <p style="margin-top:0; color:${accent}; font-weight:700;">${input.success ? 'Conexión completada' : 'Conexión pendiente'}</p>
      <h1 style="margin-top:0; font-size: 1.6rem;">${title}</h1>
      <p style="line-height:1.6; color:#d1d5db;">${message}</p>
      ${actionLink}
      <p style="line-height:1.6; color:#9ca3af; margin-bottom:0;">Podés cerrar esta pestaña y volver a BarberApp.</p>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
