"use client";

import {
  ArrowRight,
  Eye,
  EyeOff,
  GitCompare,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { Alert, Button, Field, FullPageSpinner, Input } from "@/components/ui";
import { ApiError } from "@/lib/api";

const REASON_MESSAGES: Record<string, { tone: "info" | "warning"; text: string }> = {
  token_expired: { tone: "warning", text: "Your session expired. Please sign in again." },
  token_revoked: { tone: "warning", text: "Your session was signed out. Please sign in again." },
  invalid_token: { tone: "warning", text: "Your session is no longer valid. Please sign in again." },
  unauthenticated: { tone: "info", text: "Please sign in to continue." },
  signed_out: { tone: "info", text: "You have been signed out." },
};

const FEATURES = [
  { icon: ShieldCheck, title: "Role-based access", text: "Administrators edit, viewers read." },
  { icon: Users, title: "Dealership isolation", text: "Each team only ever sees its own stock." },
  {
    icon: GitCompare,
    title: "Conflict-safe editing",
    text: "Simultaneous edits never silently overwrite each other.",
  },
];

function LoginForm() {
  const { status, login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const reason = REASON_MESSAGES[params.get("reason") ?? ""];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace("/vehicles/");
  }, [status, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/vehicles/");
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_credentials") {
        setError("Incorrect email or password.");
      } else if (err instanceof ApiError && err.code === "validation_error") {
        setError("Enter your email and password.");
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-brand-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(60rem 40rem at 10% -10%, rgba(99,102,241,.55), transparent 60%), radial-gradient(40rem 30rem at 110% 110%, rgba(56,189,248,.35), transparent 60%)",
          }}
          aria-hidden
        />
        <div className="relative">
          <span className="inline-flex rounded-2xl bg-white/95 px-3 py-2 shadow-lg">
            <Logo />
          </span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight text-white">
            Your inventory,
            <br />
            always in sync.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-indigo-100/90">
            One place for every vehicle on the lot. Update status the moment a deal closes and
            trust that what you see is current.
          </p>
          <ul className="mt-10 space-y-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/15">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-medium text-white">{title}</span>
                  <span className="block text-sm text-indigo-100/80">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-indigo-200/70">
          Demo environment · all dealerships and accounts are fictional
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
          <p className="mt-1.5 text-sm text-slate-600">Use your dealership account to continue.</p>

          <div className="mt-6 space-y-3">
            {reason && !error && (
              <Alert tone={reason.tone} testId="login-reason">
                {reason.text}
              </Alert>
            )}
            {error && (
              <Alert tone="error" testId="login-error">
                {error}
              </Alert>
            )}
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-5" noValidate>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@dealership.test"
                invalid={!!error}
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  invalid={!!error}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
              {!submitting && <ArrowRight className="size-4" aria-hidden />}
            </Button>
          </form>

        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary in a statically exported page.
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <LoginForm />
    </Suspense>
  );
}
