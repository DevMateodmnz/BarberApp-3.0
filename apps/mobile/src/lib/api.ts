/**
 * API client for BarberApp backend
 *
 * Uses Axios with configurable base URL from environment.
 * Token injection will be added when Clerk auth hooks are
 * connected in the sign-in flow (PR-028B+).
 *
 * TODO: Replace local ApiResponse type with import from @barberapp/shared
 *       once the shared package is built and published.
 */
import axios from 'axios';

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
 * Pre-configured Axios instance for BarberApp API calls.
 *
 * Usage:
 *   import { api } from '@/lib/api';
 *   const response = await api.get<ApiResponse<SomeData>>(
 *     '/barbershops/123/service-records/summary?date=2026-06-06'
 *   );
 *
 * Token injection will be added in a later PR when Clerk auth
 * hooks are connected. For now, the test middleware (x-test-user-id)
 * handles auth in development.
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});