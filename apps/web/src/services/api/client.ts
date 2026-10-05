/**
 * Base HTTP client for SevaSetu REST API communication
 * Communicates with the Express API (/api/v1)
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export interface ApiEnvelope<T> {
  success: true;
  data: T;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  token?: string;
  body?: unknown;
}

export async function apiClient<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const { token, body, headers = {}, ...customConfig } = options;

  const requestHeaders: Record<string, string> = {
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(headers as Record<string, string>),
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...customConfig,
      headers: requestHeaders,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(
      'Unable to reach the server. Check your connection and try again.',
      'NETWORK_ERROR',
      0
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Empty or non-JSON body (e.g. 204)
  }

  if (!response.ok) {
    const errBody = payload as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(
      errBody?.error?.message || `Request failed with status ${response.status}`,
      errBody?.error?.code || 'UNKNOWN_ERROR',
      response.status
    );
  }

  return payload as ApiEnvelope<T>;
}
