/**
 * API client for BarberApp backend
 *
 * Uses Axios with configurable base URL from environment.
 * Supports Clerk token injection via createAuthInterceptor().
 */
import axios, { type InternalAxiosRequestConfig } from 'axios';

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

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

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