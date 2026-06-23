// Same-origin by default: the SPA is served by (and proxied through) the Nest
// server, so API calls are relative to the global prefix. Override with a full
// URL (e.g. https://api.host/api/v1) only for a split-origin deploy.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";
const TOKEN_KEY = "azm_admin_token";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Called by the API helper on a 401 — wired up by AuthContext. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new ApiError(401, "Unauthorized");
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "message" in data && String((data as any).message)) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }

  // Mutating responses use the { status, message, data } envelope; GET/HEAD
  // return raw data. Unwrap the envelope so callers always get the payload.
  if (isEnvelope(data)) return data.data as T;
  return data as T;
}

function isEnvelope(v: unknown): v is { status: string; message: string; data: unknown } {
  return (
    !!v && typeof v === "object" && "status" in v && "message" in v && "data" in v
  );
}
