const DEFAULT_DEVELOPMENT_API_URL = 'http://localhost:3000/api/v1';

export interface PublicWebRuntime {
  apiBaseUrl: string;
}

export class PublicWebRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicWebRuntimeError';
  }
}

export function normalizeApiBaseUrl(
  rawValue: string,
  nodeEnv: NodeJS.ProcessEnv['NODE_ENV'] = process.env.NODE_ENV
): string {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    throw new PublicWebRuntimeError('PUBLIC_WEB_API_URL cannot be empty.');
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new PublicWebRuntimeError(
      'PUBLIC_WEB_API_URL must be a valid absolute URL ending in /api/v1.'
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new PublicWebRuntimeError(
      'PUBLIC_WEB_API_URL must use http:// or https://.'
    );
  }

  if (parsed.username || parsed.password) {
    throw new PublicWebRuntimeError(
      'PUBLIC_WEB_API_URL must not include credentials.'
    );
  }

  if (parsed.search || parsed.hash) {
    throw new PublicWebRuntimeError(
      'PUBLIC_WEB_API_URL must not include query strings or fragments.'
    );
  }

  if (nodeEnv === 'production' && parsed.protocol !== 'https:') {
    throw new PublicWebRuntimeError(
      'Production requires PUBLIC_WEB_API_URL to use https://.'
    );
  }

  const pathname = parsed.pathname.replace(/\/+$/, '');

  if (pathname !== '/api/v1') {
    throw new PublicWebRuntimeError(
      'PUBLIC_WEB_API_URL must point to the API base path /api/v1 exactly.'
    );
  }

  return `${parsed.origin}/api/v1`;
}

export function readPublicWebRuntime(
  env: NodeJS.ProcessEnv = process.env
): PublicWebRuntime {
  const rawValue = env.PUBLIC_WEB_API_URL;

  if (rawValue === undefined) {
    if (env.NODE_ENV === 'production') {
      throw new PublicWebRuntimeError(
        'PUBLIC_WEB_API_URL is required in production.'
      );
    }

    return {
      apiBaseUrl: DEFAULT_DEVELOPMENT_API_URL,
    };
  }

  return {
    apiBaseUrl: normalizeApiBaseUrl(rawValue, env.NODE_ENV),
  };
}

let cachedRuntime: PublicWebRuntime | null = null;

export function getPublicWebRuntime() {
  if (!cachedRuntime) {
    cachedRuntime = readPublicWebRuntime();
  }

  return cachedRuntime;
}
