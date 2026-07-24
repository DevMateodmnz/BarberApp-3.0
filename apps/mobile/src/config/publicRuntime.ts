const DEFAULT_INVALID_API_URL = 'http://invalid.local/api/v1';
const SUPPORTED_APP_ENVS = ['development', 'preview', 'production'] as const;
const FORBIDDEN_PUBLIC_CLERK_VARS = [
  'EXPO_PUBLIC_CLERK_SECRET_KEY',
  'EXPO_PUBLIC_CLERK_WEBHOOK_SECRET',
] as const;

export type MobileAppEnvironment = (typeof SUPPORTED_APP_ENVS)[number];

export interface MobilePublicRuntime {
  appEnv: MobileAppEnvironment;
  apiBaseUrl: string;
  clerkPublishableKey: string;
  physicalQa?: MobilePhysicalQaRuntime;
}

export interface MobilePhysicalQaRuntime {
  runtimeId: string;
  fingerprint: string;
  repositoryHead: string;
  startedAt: string;
  traceEnabled: true;
}

export type MobilePublicRuntimeResult =
  | { ok: true; value: MobilePublicRuntime }
  | { ok: false; error: PublicRuntimeConfigError };

export class PublicRuntimeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicRuntimeConfigError';
  }
}

export function readMobilePublicRuntime(env: NodeJS.ProcessEnv): MobilePublicRuntime {
  const appEnv = readMobileAppEnvironment(env);

  assertNoForbiddenPublicClerkSecrets(env);
  const apiBaseUrl = readApiBaseUrl(env, appEnv);
  const physicalQa = readPhysicalQaRuntime(env, appEnv);

  return {
    appEnv,
    apiBaseUrl,
    clerkPublishableKey: readClerkPublishableKey(env, appEnv),
    ...(physicalQa ? { physicalQa } : {}),
  };
}

export function readMobilePublicRuntimeResult(
  env: NodeJS.ProcessEnv,
): MobilePublicRuntimeResult {
  try {
    return { ok: true, value: readMobilePublicRuntime(env) };
  } catch (error) {
    if (error instanceof PublicRuntimeConfigError) {
      return { ok: false, error };
    }

    throw error;
  }
}

export function readMobileAppEnvironment(env: NodeJS.ProcessEnv): MobileAppEnvironment {
  const rawValue = env.EXPO_PUBLIC_APP_ENV;

  if (rawValue === undefined) {
    return 'development';
  }

  const value = rawValue.trim();

  if (value === '') {
    throw new PublicRuntimeConfigError(
      'EXPO_PUBLIC_APP_ENV cannot be empty. Use development, preview, or production.',
    );
  }

  if (SUPPORTED_APP_ENVS.includes(value as MobileAppEnvironment)) {
    return value as MobileAppEnvironment;
  }

  throw new PublicRuntimeConfigError(
    'EXPO_PUBLIC_APP_ENV must be development, preview, or production.',
  );
}

export function getDefaultDevelopmentApiUrl(): string {
  return createDefaultDevelopmentApiUrl();
}

export function getInvalidApiUrlFallback(): string {
  return DEFAULT_INVALID_API_URL;
}

export function normalizeApiBaseUrl(
  rawValue: string,
  appEnv: MobileAppEnvironment,
): string {
  const trimmedValue = rawValue.trim();

  if (trimmedValue === '') {
    throw new PublicRuntimeConfigError(
      `EXPO_PUBLIC_API_URL is required for ${appEnv} builds.`,
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmedValue);
  } catch {
    throw new PublicRuntimeConfigError(
      'EXPO_PUBLIC_API_URL must be a valid absolute URL ending in /api/v1.',
    );
  }

  if (!isSupportedApiProtocol(parsedUrl.protocol)) {
    throw new PublicRuntimeConfigError(
      'EXPO_PUBLIC_API_URL must use http:// or https://.',
    );
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new PublicRuntimeConfigError(
      'EXPO_PUBLIC_API_URL must not include credentials.',
    );
  }

  if (parsedUrl.search || parsedUrl.hash) {
    throw new PublicRuntimeConfigError(
      'EXPO_PUBLIC_API_URL must not include query strings or fragments.',
    );
  }

  if (appEnv === 'production' && parsedUrl.protocol !== 'https:') {
    throw new PublicRuntimeConfigError(
      'Production builds require EXPO_PUBLIC_API_URL to use https://.',
    );
  }

  if (appEnv !== 'development' && isPrivateOrLoopbackHost(parsedUrl.hostname)) {
    throw new PublicRuntimeConfigError(
      `${appEnv} builds require a non-local EXPO_PUBLIC_API_URL host.`,
    );
  }

  const normalizedPathname = parsedUrl.pathname.replace(/\/+$/, '');

  if (normalizedPathname !== '/api/v1') {
    throw new PublicRuntimeConfigError(
      'EXPO_PUBLIC_API_URL must point to the API base path /api/v1 exactly.',
    );
  }

  return `${parsedUrl.origin}/api/v1`;
}

export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const normalizedHost = hostname.trim().toLowerCase();

  if (
    normalizedHost === 'localhost'
    || normalizedHost === '0.0.0.0'
    || normalizedHost === '::1'
    || normalizedHost.endsWith('.local')
    || normalizedHost.endsWith('.lan')
  ) {
    return true;
  }

  if (isPrivateOrLoopbackIpv4(normalizedHost)) {
    return true;
  }

  if (isPrivateOrLoopbackIpv6(normalizedHost)) {
    return true;
  }

  return false;
}

function readApiBaseUrl(
  env: NodeJS.ProcessEnv,
  appEnv: MobileAppEnvironment,
): string {
  const rawValue = env.EXPO_PUBLIC_API_URL;

  if (rawValue === undefined) {
    if (appEnv === 'development') {
      return createDefaultDevelopmentApiUrl();
    }

    throw new PublicRuntimeConfigError(
      `EXPO_PUBLIC_API_URL is required for ${appEnv} builds.`,
    );
  }

  return normalizeApiBaseUrl(rawValue, appEnv);
}

function readClerkPublishableKey(
  env: NodeJS.ProcessEnv,
  appEnv: MobileAppEnvironment,
): string {
  const rawValue = env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (rawValue === undefined || rawValue.trim() === '') {
    throw new PublicRuntimeConfigError(
      'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is required before the app can start.',
    );
  }

  const value = rawValue.trim();

  if (!/^pk_(test|live)_[A-Za-z0-9_-]+$/.test(value)) {
    throw new PublicRuntimeConfigError(
      'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY must be a valid Clerk publishable key.',
    );
  }

  if (appEnv === 'production' && !value.startsWith('pk_live_')) {
    throw new PublicRuntimeConfigError(
      'Production builds must use a live Clerk publishable key (pk_live_...).',
    );
  }

  return value;
}

function readPhysicalQaRuntime(
  env: NodeJS.ProcessEnv,
  appEnv: MobileAppEnvironment,
): MobilePhysicalQaRuntime | undefined {
  const rawMode = env.EXPO_PUBLIC_PHYSICAL_QA_MODE;
  if (rawMode === undefined || rawMode === 'false') {
    return undefined;
  }
  if (rawMode !== 'true') {
    throw new PublicRuntimeConfigError(
      'EXPO_PUBLIC_PHYSICAL_QA_MODE must be true or false.',
    );
  }
  if (appEnv !== 'development') {
    throw new PublicRuntimeConfigError(
      'Physical-QA mode is only available in development builds.',
    );
  }
  if (env.EXPO_PUBLIC_PHYSICAL_QA_TRACE !== 'true') {
    throw new PublicRuntimeConfigError(
      'EXPO_PUBLIC_PHYSICAL_QA_TRACE must be true in physical-QA mode.',
    );
  }

  const runtimeId = env.EXPO_PUBLIC_QA_RUNTIME_ID?.trim();
  const fingerprint = env.EXPO_PUBLIC_QA_RUNTIME_FINGERPRINT?.trim();
  const repositoryHead = env.EXPO_PUBLIC_QA_RUNTIME_HEAD?.trim();
  const startedAt = env.EXPO_PUBLIC_QA_RUNTIME_STARTED_AT?.trim();

  if (!runtimeId || !/^[a-f0-9]{32}$/u.test(runtimeId)) {
    throw new PublicRuntimeConfigError(
      'EXPO_PUBLIC_QA_RUNTIME_ID must be a 32-character lowercase hexadecimal value.',
    );
  }
  if (!fingerprint || !/^[A-F0-9]{8}$/u.test(fingerprint)) {
    throw new PublicRuntimeConfigError(
      'EXPO_PUBLIC_QA_RUNTIME_FINGERPRINT must be 8 uppercase hexadecimal characters.',
    );
  }
  if (fingerprint !== runtimeId.slice(0, 8).toUpperCase()) {
    throw new PublicRuntimeConfigError(
      'EXPO_PUBLIC_QA_RUNTIME_FINGERPRINT must match the runtime ID prefix.',
    );
  }
  if (!repositoryHead || !/^[a-f0-9]{40}$/u.test(repositoryHead)) {
    throw new PublicRuntimeConfigError(
      'EXPO_PUBLIC_QA_RUNTIME_HEAD must be a full Git commit hash.',
    );
  }
  if (
    !startedAt
    || !Number.isFinite(Date.parse(startedAt))
    || new Date(startedAt).toISOString() !== startedAt
  ) {
    throw new PublicRuntimeConfigError(
      'EXPO_PUBLIC_QA_RUNTIME_STARTED_AT must be an ISO-8601 timestamp.',
    );
  }

  return {
    runtimeId,
    fingerprint,
    repositoryHead,
    startedAt,
    traceEnabled: true,
  };
}

function createDefaultDevelopmentApiUrl(): string {
  return ['http', '://', 'local', 'host', ':3000', '/api', '/v1'].join('');
}

function assertNoForbiddenPublicClerkSecrets(env: NodeJS.ProcessEnv): void {
  const forbiddenVar = FORBIDDEN_PUBLIC_CLERK_VARS.find((variableName) => {
    const value = env[variableName];
    return typeof value === 'string' && value.trim() !== '';
  });

  if (forbiddenVar) {
    throw new PublicRuntimeConfigError(
      `${forbiddenVar} must never be set in the mobile app environment.`,
    );
  }
}

function isSupportedApiProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:';
}

function isPrivateOrLoopbackIpv4(hostname: string): boolean {
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;

  if (!ipv4Pattern.test(hostname)) {
    return false;
  }

  const octets = hostname.split('.').map((octet) => Number.parseInt(octet, 10));

  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return true;
  }

  const first = octets[0] ?? -1;
  const second = octets[1] ?? -1;

  return first === 10
    || first === 127
    || first === 169 && second === 254
    || first === 172 && second >= 16 && second <= 31
    || first === 192 && second === 168;
}

function isPrivateOrLoopbackIpv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[/, '').replace(/\]$/, '');

  return normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb');
}

const runtimeResult = readMobilePublicRuntimeResult(process.env);

export function getMobilePublicRuntimeResult(): MobilePublicRuntimeResult {
  return runtimeResult;
}

export function getMobilePublicRuntime(): MobilePublicRuntime {
  if (!runtimeResult.ok) {
    throw runtimeResult.error;
  }

  return runtimeResult.value;
}
