"use client";

import { CircleCheck, CircleX, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

type Tone = "success" | "error" | "info";
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
}

const ToastContext = createContext<((t: Omit<Toast, "id">) => void) | null>(null);

const ICONS = { success: CircleCheck, error: CircleX, info: Info };
const ICON_COLOR = { success: "text-emerald-500", error: "text-rose-500", info: "text-sky-500" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { ...t, id }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl bg-white p-4 shadow-lg ring-1 ring-slate-200"
            >
              <Icon className={cn("mt-0.5 size-5 shrink-0", ICON_COLOR[t.tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{t.title}</p>
                {t.description && <p className="mt-0.5 text-sm text-slate-600">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="rounded-md p-0.5 text-slate-400 hover:text-slate-600"
                aria-label="Dismiss notification"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast must be used inside ToastProvider");
  return push;
}
