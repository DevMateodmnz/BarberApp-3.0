/**
 * Context loader — fetches current user context from the backend.
 *
 * Calls GET /me/context with a Clerk JWT Bearer token header
 * and returns typed CurrentUserContext data.
 */
import { api, type ApiResponse, type GetToken } from './api.js';
import type { CurrentUserContext } from './types.js';

/**
 * Fetches the authenticated user's app context from the backend.
 *
 * Injects the Clerk JWT as a Bearer token per-request.
 * Does not rely on global Axios interceptors — the getToken
 * function is called within this function.
 *
 * @param getToken - Clerk's getToken function (or any async function
 *   returning a JWT string or null).
 * @returns The CurrentUserContext data from /me/context.
 * @throws Error if the network request fails or the API returns
 *   an unsuccessful response.
 */
export async function fetchCurrentUserContext(
  getToken: GetToken
): Promise<CurrentUserContext> {
  const token = await getToken();
  const response = await api.get<ApiResponse<CurrentUserContext>>(
    '/me/context',
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }
  );

  const { data } = response;

  if (!data.success || !data.data) {
    throw new Error(
      data.error?.message ?? 'Failed to fetch user context'
    );
  }

  return data.data;
}