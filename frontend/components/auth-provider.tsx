"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, setUnauthorizedHandler } from "@/lib/api";
import { clearToken, getToken, setToken } from "@/lib/session";
import type { User } from "@/lib/types";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: Status;
  user: User | null;
  /**
   * Why the user is signed out (an API error code such as "token_expired", or "signed_out").
   * The route guard (AppShell) is the single place that redirects to /login, and it passes
   * this along so the login page can explain what happened.
   */
  signedOutReason: string | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [signedOutReason, setSignedOutReason] = useState<string | null>(null);

  const signOutLocally = useCallback((reason: string | null) => {
    clearToken();
    setUser(null);
    setSignedOutReason(reason);
    setStatus("anonymous");
  }, []);

  // Any 401 from any API call (expired, revoked, forged token) lands here.
  useEffect(() => {
    setUnauthorizedHandler((code) => signOutLocally(code));
    return () => setUnauthorizedHandler(null);
  }, [signOutLocally]);

  // On first load, ask the server whether the stored token is still valid. Status starts as
  // "loading" on both the static prerender and the client, so hydration always matches.
  useEffect(() => {
    const ctrl = new AbortController();
    const check: Promise<User | null> = getToken() ? api.me(ctrl.signal) : Promise.resolve(null);
    check
      .then((u) => {
        setUser(u);
        setStatus(u ? "authenticated" : "anonymous");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // 401s are handled by the unauthorized handler; anything else (network) -> signed out.
        if (!(err instanceof ApiError && err.status === 401)) signOutLocally(null);
      });
    return () => ctrl.abort();
  }, [signOutLocally]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setToken(res.access_token);
    setUser(res.user);
    setSignedOutReason(null);
    setStatus("authenticated");
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout(); // revoke the session server-side first
    } catch {
      // Even if the server is unreachable, forget the token locally.
    }
    signOutLocally("signed_out");
  }, [signOutLocally]);

  const value = useMemo(
    () => ({ status, user, signedOutReason, login, logout }),
    [status, user, signedOutReason, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
