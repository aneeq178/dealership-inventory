/**
 * Access token storage.
 *
 * sessionStorage (not localStorage): the token is scoped to one browser tab and disappears
 * when the tab closes. A side benefit for this app: two tabs can be signed in as two different
 * administrators, which is exactly how reviewers reproduce the concurrent-edit conflict.
 *
 * The token is only ever sent in the Authorization header. The server is the authority on
 * whether it is still valid (expiry and logout are checked server-side on every request).
 */
const TOKEN_KEY = "dealership.accessToken";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // storage blocked (privacy mode); the app then behaves as signed out
  }
}

export function getToken(): string | null {
  return storage()?.getItem(TOKEN_KEY) ?? null;
}

export function setToken(token: string): void {
  storage()?.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  storage()?.removeItem(TOKEN_KEY);
}
