"use client";

import {
  CircleCheck,
  CircleX,
  Info,
  LoaderCircle,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn, STATUS_LABEL } from "@/lib/format";
import type { Role, VehicleStatus } from "@/lib/types";

/* ---------------------------------------------------------------- Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "warning";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:bg-brand-600/50",
  secondary:
    "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 shadow-sm hover:bg-slate-50 disabled:text-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-400",
  danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-700 disabled:bg-rose-600/50",
  warning: "bg-amber-500 text-white shadow-sm hover:bg-amber-600 disabled:bg-amber-500/50",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon: Icon,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-11 px-5 text-base",
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : (
        Icon && <Icon className="size-4" aria-hidden />
      )}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- Badges */

const STATUS_STYLES: Record<VehicleStatus, string> = {
  available: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  reserved: "bg-amber-50 text-amber-800 ring-amber-600/20",
  sold: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

const STATUS_DOT: Record<VehicleStatus, string> = {
  available: "bg-emerald-500",
  reserved: "bg-amber-500",
  sold: "bg-slate-400",
};

export function StatusBadge({ status }: { status: VehicleStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        STATUS_STYLES[status],
      )}
    >
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function StatusDot({ status }: { status: VehicleStatus }) {
  return <span className={cn("inline-block size-2.5 rounded-full", STATUS_DOT[status])} aria-hidden />;
}

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        role === "admin"
          ? "bg-brand-50 text-brand-700 ring-brand-600/20"
          : "bg-sky-50 text-sky-700 ring-sky-600/20",
        className,
      )}
    >
      {role === "admin" ? "Administrator" : "Viewer"}
    </span>
  );
}

/* ---------------------------------------------------------------- Alert */

type AlertTone = "info" | "success" | "warning" | "error";

const ALERT_STYLES: Record<AlertTone, { box: string; icon: LucideIcon; iconColor: string }> = {
  info: { box: "bg-sky-50 ring-sky-200 text-sky-900", icon: Info, iconColor: "text-sky-500" },
  success: {
    box: "bg-emerald-50 ring-emerald-200 text-emerald-900",
    icon: CircleCheck,
    iconColor: "text-emerald-500",
  },
  warning: {
    box: "bg-amber-50 ring-amber-200 text-amber-900",
    icon: TriangleAlert,
    iconColor: "text-amber-500",
  },
  error: { box: "bg-rose-50 ring-rose-200 text-rose-900", icon: CircleX, iconColor: "text-rose-500" },
};

export function Alert({
  tone = "info",
  title,
  children,
  icon,
  actions,
  className,
  testId,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const style = ALERT_STYLES[tone];
  const Icon = icon ?? style.icon;
  return (
    <div
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      data-testid={testId}
      className={cn("animate-fade-in rounded-xl p-4 ring-1 ring-inset", style.box, className)}
    >
      <div className="flex gap-3">
        <Icon className={cn("mt-0.5 size-5 shrink-0", style.iconColor)} aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          {title && <p className="font-semibold">{title}</p>}
          {children && (
            <div className={cn(title ? "mt-1" : null, "leading-relaxed opacity-90")}>{children}</div>
          )}
          {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Form */

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-rose-600">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

const CONTROL =
  "block w-full rounded-lg border-0 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";

export function Input({
  invalid,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL,
        invalid ? "ring-rose-400 focus:ring-rose-500" : "ring-slate-300 focus:ring-brand-500",
        className,
      )}
    />
  );
}

export function Select({
  invalid,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      {...props}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL,
        "pr-8",
        invalid ? "ring-rose-400 focus:ring-rose-500" : "ring-slate-300 focus:ring-brand-500",
        className,
      )}
    >
      {children}
    </select>
  );
}

/* ---------------------------------------------------------------- Misc */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl bg-white shadow-sm ring-1 ring-slate-200", className)}>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-200/70", className)} aria-hidden />;
}

export function FullPageSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center" role="status">
      <LoaderCircle className="size-6 animate-spin text-brand-600" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}
