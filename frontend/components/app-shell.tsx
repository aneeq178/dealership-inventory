"use client";

import { Building2, CarFront, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth-provider";
import { Button, FullPageSpinner, RoleBadge } from "./ui";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-600/30">
        <CarFront className="size-5" aria-hidden />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-slate-900">
        Dealer<span className="text-brand-600">Desk</span>
      </span>
    </span>
  );
}

/** Wraps every signed-in page: guards the route and renders the top bar. */
export function AppShell({ children }: { children: ReactNode }) {
  const { status, user, signedOutReason, logout } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  // The only redirect to /login for signed-in pages, so the reason is never lost.
  useEffect(() => {
    if (status !== "anonymous") return;
    router.replace(
      signedOutReason ? `/login/?reason=${encodeURIComponent(signedOutReason)}` : "/login/",
    );
  }, [status, signedOutReason, router]);

  if (status !== "authenticated" || !user) return <FullPageSpinner />;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/vehicles/" aria-label="Inventory home">
            <Logo />
          </Link>

          <span className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 md:inline-flex">
            <Building2 className="size-4 text-slate-500" aria-hidden />
            <span data-testid="dealership-name">{user.dealership.name}</span>
          </span>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-slate-900" data-testid="user-name">
                {user.name}
              </p>
              <p className="text-xs leading-tight text-slate-500">{user.email}</p>
            </div>
            <span className="hidden sm:inline-flex">
              <RoleBadge role={user.role} />
            </span>
            <span
              className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700"
              aria-hidden
            >
              {initials(user.name)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              icon={LogOut}
              loading={signingOut}
              onClick={async () => {
                setSigningOut(true);
                await logout();
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
