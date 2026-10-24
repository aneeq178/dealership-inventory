/**
 * The only module that talks to the backend.
 *
 * Every failure becomes an ApiError with a stable `code` so pages can react precisely:
 *   401 (any code)        -> session handler signs the user out and redirects to /login
 *   403 forbidden         -> page shows a permission message
 *   404 not_found         -> page shows "not found in your dealership"
 *   409 version_conflict  -> edit form shows the conflict panel with the current record
 *   422 validation_error  -> field-level messages
 *   network / 5xx         -> generic "can't reach the server" with retry
 */
import { clearToken, getToken } from "./session";
import type {
  ApiErrorBody,
  LoginResponse,
  User,
  Vehicle,
  VehicleUpdate,
} from "./types";

/** Empty in production (same origin). Set to http://localhost:8000 for `next dev`. */
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isNetworkError() {
    return this.status === 0;
  }
}

type UnauthorizedHandler = (code: string) => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** Registered by AuthProvider so any 401 anywhere signs the user out consistently. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  /** false for the login call itself, where 401 means "wrong password", not "signed out". */
  authenticated?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, authenticated = true, signal } = opts;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (authenticated) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(
      0,
      "network_error",
      "Can't reach the server. Check your connection and try again.",
    );
  }

  if (res.status === 204) return undefined as T;

  const payload: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const envelope = payload as Partial<ApiErrorBody> | null;
    const code = envelope?.error?.code ?? (res.status >= 500 ? "server_error" : "http_error");
    const message =
      envelope?.error?.message ??
      (res.status >= 500
        ? "The server had a problem handling that request. Please try again."
        : `Request failed (${res.status}).`);
    const error = new ApiError(res.status, code, message, envelope?.error?.details);

    if (res.status === 401 && authenticated) {
      clearToken();
      onUnauthorized?.(code);
    }
    throw error;
  }

  return payload as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: { email, password },
      authenticated: false,
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me: (signal?: AbortSignal) => request<User>("/api/auth/me", { signal }),
  listVehicles: (signal?: AbortSignal) =>
    request<{ items: Vehicle[] }>("/api/vehicles", { signal }).then((r) => r.items),
  getVehicle: (id: string, signal?: AbortSignal) =>
    request<Vehicle>(`/api/vehicles/${encodeURIComponent(id)}`, { signal }),
  updateVehicle: (id: string, body: VehicleUpdate) =>
    request<Vehicle>(`/api/vehicles/${encodeURIComponent(id)}`, { method: "PUT", body }),
};
