/**
 * API client for BarberApp backend
 *
 * Uses Axios with configurable base URL from environment.
 * Supports Clerk token injection via createAuthInterceptor().
 */
import axios, { type InternalAxiosRequestConfig } from 'axios';

import {
  getInvalidApiUrlFallback,
  getMobilePublicRuntimeResult,
} from '@/config/publicRuntime.js';

/**
 * API response envelope — mirrors @barberapp/shared ApiResponse<T>
 * until the shared package is built and properly linked.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

const mobilePublicRuntimeResult = getMobilePublicRuntimeResult();
const API_BASE_URL = mobilePublicRuntimeResult.ok
  ? mobilePublicRuntimeResult.value.apiBaseUrl
  : getInvalidApiUrlFallback();

/**
 * Structured API error — thrown by API client helpers when a response
 * carries an error payload.
 *
 * Preserves the backend error code and HTTP status so callers can
 * use robust code/status checks instead of fragile string matching.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Pre-configured Axios instance for BarberApp API calls.
 *
 * Usage:
 *   import { api } from '@/lib/api';
 *   const response = await api.get<ApiResponse<SomeData>>(
 *     '/barbershops/123/service-records/summary?date=2026-06-06'
 *   );
 *
 * Token injection is added by calling createAuthInterceptor(getToken)
 * and registering the returned interceptor on this instance.
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!mobilePublicRuntimeResult.ok) {
    throw mobilePublicRuntimeResult.error;
  }

  return config;
});

/**
 * Normalises an Axios rejection (or any thrown error) into a project ApiError.
 *
 * When the backend returns a non-2xx response, Axios rejects with an error
 * carrying `response.status` and `response.data`.  This function extracts the
 * structured `error.code` and `error.message` from the backend payload and
 * re-throws as a typed {@link ApiError} that the mobile friendly-error
 * mapper (`friendlyCreateEmployeeError`) can consume.
 *
 * Errors without a `response` (network failures, timeouts, non-HTTP throws)
 * pass through unchanged.
 *
 * Exported so the interceptor logic can be tested in isolation.
 */
export function toApiError(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const err = error as {
      response?: { status: number; data: ApiResponse };
      message?: string;
    };
    if (err.response) {
      const data = err.response.data;
      const message =
        data?.error?.message ?? err.message ?? 'Request failed';
      const code = data?.error?.code;
      const status = err.response.status;
      throw new ApiError(message, code, status);
    }
  }
  throw error;
}

// Register the response error interceptor so every API call automatically
// converts non-2xx Axios rejections into structured ApiError instances.
api.interceptors.response.use(undefined, (error: unknown) =>
  toApiError(error),
);

/**
 * Token provider function type — matches Clerk's getToken().
 * Returns a JWT string or null if the user is not authenticated.
 */
export type GetToken = () => Promise<string | null>;

/**
 * Creates a request interceptor that injects the Clerk JWT
 * as a Bearer token into Authorization headers.
 *
 * @param getToken - Clerk's getToken function (or any async function
 *   returning a JWT string or null).
 * @returns The interceptor function — register it with
 *   `api.interceptors.request.use(interceptor)` in your app init.
 *
 * @example
 *   import { useAuth } from '@clerk/clerk-expo';
 *   // Inside a React component or hook:
 *   const { getToken } = useAuth();
 *   const interceptor = createAuthInterceptor(getToken);
 *   api.interceptors.request.use(interceptor);
 */
export function createAuthInterceptor(getToken: GetToken) {
  return async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  };
}