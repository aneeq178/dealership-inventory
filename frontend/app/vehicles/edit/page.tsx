"use client";

import {
  ArrowLeft,
  Clock,
  GitCompare,
  History,
  Lock,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  Tag,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast";
import {
  Alert,
  Button,
  Card,
  Field,
  FullPageSpinner,
  Input,
  Select,
  Skeleton,
  StatusBadge,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { absoluteTime, relativeTime, STATUS_LABEL, vehicleTitle } from "@/lib/format";
import {
  VEHICLE_STATUSES,
  type ConflictDetails,
  type FieldError,
  type Vehicle,
  type VehicleStatus,
} from "@/lib/types";

interface FormState {
  make: string;
  model: string;
  year: string;
  status: VehicleStatus;
}

type FieldName = keyof FormState;
const FIELD_LABELS: Record<FieldName, string> = {
  make: "Make",
  model: "Model",
  year: "Year",
  status: "Status",
};

function toForm(v: Vehicle): FormState {
  return { make: v.make, model: v.model, year: String(v.year), status: v.status };
}

function display(field: FieldName, value: string) {
  return field === "status" ? STATUS_LABEL[value] ?? value : value;
}

function validate(f: FormState): Partial<Record<FieldName, string>> {
  const errors: Partial<Record<FieldName, string>> = {};
  if (!f.make.trim()) errors.make = "Make is required.";
  else if (f.make.trim().length > 50) errors.make = "Make must be 50 characters or fewer.";
  if (!f.model.trim()) errors.model = "Model is required.";
  else if (f.model.trim().length > 50) errors.model = "Model must be 50 characters or fewer.";
  const year = Number(f.year);
  if (!/^\d{4}$/.test(f.year) || year < 1900 || year > 2100)
    errors.year = "Enter a year between 1900 and 2100.";
  return errors;
}

type Banner =
  | { kind: "conflict"; details: ConflictDetails; yours: FormState }
  | { kind: "forbidden"; message: string }
  | { kind: "not_found" }
  | { kind: "error"; error: ApiError }
  | { kind: "saved"; version: number }
  | { kind: "refreshed"; version: number };

function ConflictPanel({
  details,
  yours,
  onRefresh,
  refreshing,
}: {
  details: ConflictDetails;
  yours: FormState;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const current = details.current;
  const currentForm = toForm(current);
  const fields = (Object.keys(FIELD_LABELS) as FieldName[]).map((f) => ({
    field: f,
    yours: yours[f],
    theirs: currentForm[f],
    differs: yours[f].trim() !== currentForm[f],
  }));

  return (
    <div
      role="alert"
      data-testid="conflict-panel"
      className="animate-fade-in overflow-hidden rounded-2xl bg-amber-50 ring-1 ring-amber-200"
    >
      <div className="flex gap-3 p-5">
        <GitCompare className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
        <div className="text-sm text-amber-950">
          <p className="text-base font-semibold">Someone else saved this vehicle first</p>
          <p className="mt-1 leading-relaxed">
            {current.updated_by_name ?? "Another user"} updated it{" "}
            {relativeTime(current.updated_at)} while you were editing. It is now on{" "}
            <strong>version {current.version}</strong>; you started from version{" "}
            {details.your_version}. <strong>Your changes were not saved</strong>, so nothing was
            overwritten.
          </p>
          <p className="mt-2 leading-relaxed">
            Refresh to load the latest version, then re-apply your changes if they are still
            needed.
          </p>
        </div>
      </div>

      <div className="border-t border-amber-200/70 bg-white/60 px-5 py-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-amber-800/80">
              <th className="pb-2 font-medium">Field</th>
              <th className="pb-2 font-medium">Your unsaved edit</th>
              <th className="pb-2 font-medium">Saved now</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((row) => (
              <tr key={row.field} className={row.differs ? "" : "text-slate-400"}>
                <td className="py-1 pr-4 font-medium">{FIELD_LABELS[row.field]}</td>
                <td className="py-1 pr-4">
                  {row.differs ? (
                    <span className="line-through decoration-amber-500/70">
                      {display(row.field, row.yours)}
                    </span>
                  ) : (
                    display(row.field, row.yours)
                  )}
                </td>
                <td className="py-1 font-medium" data-testid={`conflict-current-${row.field}`}>
                  {display(row.field, row.theirs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4">
          <Button variant="warning" icon={RefreshCw} loading={refreshing} onClick={onRefresh}>
            Refresh to latest version
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditVehicle({ id }: { id: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "admin";

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [banner, setBanner] = useState<Banner | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const applyVehicle = useCallback((v: Vehicle) => {
    setVehicle(v);
    setForm(toForm(v));
    setFieldErrors({});
    setLoadError(null);
    return v;
  }, []);

  const onLoadFailed = useCallback((err: unknown) => {
    if (err instanceof DOMException && err.name === "AbortError") return;
    if (err instanceof ApiError && err.status !== 401) setLoadError(err); // 401 -> signed out
  }, []);

  const load = useCallback(
    (signal?: AbortSignal) => api.getVehicle(id, signal).then(applyVehicle),
    [id, applyVehicle],
  );

  // The effect only starts the request; state changes when it settles.
  useEffect(() => {
    const ctrl = new AbortController();
    api.getVehicle(id, ctrl.signal).then(applyVehicle, onLoadFailed);
    return () => ctrl.abort();
  }, [id, applyVehicle, onLoadFailed]);

  const dirty = useMemo(() => {
    if (!vehicle || !form) return false;
    const base = toForm(vehicle);
    return (Object.keys(base) as FieldName[]).some((k) => form[k].trim() !== base[k]);
  }, [vehicle, form]);

  const inConflict = banner?.kind === "conflict";

  async function refreshLatest() {
    setRefreshing(true);
    try {
      const v = await load();
      setBanner({ kind: "refreshed", version: v.version });
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) setBanner({ kind: "error", error: err });
    } finally {
      setRefreshing(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!vehicle || !form || inConflict) return;
    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    setBanner(null);
    try {
      const saved = await api.updateVehicle(vehicle.id, {
        make: form.make.trim(),
        model: form.model.trim(),
        year: Number(form.year),
        status: form.status,
        version: vehicle.version, // the version this form was loaded from
      });
      setVehicle(saved);
      setForm(toForm(saved));
      setBanner({ kind: "saved", version: saved.version });
      toast({
        tone: "success",
        title: "Vehicle updated",
        description: `${vehicleTitle(saved)} is now on version ${saved.version}.`,
      });
    } catch (err) {
      if (!(err instanceof ApiError) || err.status === 401) return;
      if (err.code === "version_conflict" && err.details) {
        setBanner({
          kind: "conflict",
          details: err.details as unknown as ConflictDetails,
          yours: form,
        });
      } else if (err.status === 403) {
        setBanner({ kind: "forbidden", message: err.message });
      } else if (err.status === 404) {
        setBanner({ kind: "not_found" });
      } else if (err.code === "validation_error") {
        const fields = (err.details?.fields as FieldError[] | undefined) ?? [];
        const mapped: Partial<Record<FieldName, string>> = {};
        for (const f of fields) {
          if (f.field in FIELD_LABELS) mapped[f.field as FieldName] = f.message;
        }
        setFieldErrors(mapped);
        setBanner({ kind: "error", error: err });
      } else {
        setBanner({ kind: "error", error: err });
      }
    } finally {
      setSaving(false);
    }
  }

  const backLink = (
    <Link
      href="/vehicles/"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Back to inventory
    </Link>
  );

  if (loadError) {
    const notFound = loadError.status === 404;
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {backLink}
        <Alert
          tone={notFound ? "warning" : "error"}
          icon={loadError.isNetworkError ? WifiOff : undefined}
          title={notFound ? "Vehicle not found" : "Couldn't load this vehicle"}
          testId="load-error"
          actions={
            !notFound && (
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                onClick={() => load().catch(onLoadFailed)}
              >
                Try again
              </Button>
            )
          }
        >
          {notFound
            ? "This vehicle doesn't exist or isn't part of your dealership's inventory."
            : loadError.message}
        </Alert>
      </div>
    );
  }

  if (!vehicle || !form) {
    return (
      <div className="mx-auto max-w-5xl space-y-6" aria-label="Loading vehicle">
        {backLink}
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  const readOnly = !isAdmin;
  const disabled = readOnly || saving || inConflict;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {backLink}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900" data-testid="vehicle-title">
          {vehicleTitle(vehicle)}
        </h1>
        <StatusBadge status={vehicle.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {banner?.kind === "conflict" && (
            <ConflictPanel
              details={banner.details}
              yours={banner.yours}
              onRefresh={refreshLatest}
              refreshing={refreshing}
            />
          )}
          {banner?.kind === "forbidden" && (
            <Alert tone="error" icon={ShieldAlert} title="Not allowed" testId="forbidden-alert">
              {banner.message}
            </Alert>
          )}
          {banner?.kind === "not_found" && (
            <Alert tone="warning" title="Vehicle no longer available" testId="notfound-alert">
              This vehicle isn&apos;t part of your dealership&apos;s inventory anymore.
            </Alert>
          )}
          {banner?.kind === "error" && (
            <Alert
              tone="error"
              icon={banner.error.isNetworkError ? WifiOff : undefined}
              title="Changes not saved"
              testId="save-error"
            >
              {banner.error.message}
            </Alert>
          )}
          {banner?.kind === "saved" && (
            <Alert tone="success" title="Saved" testId="save-success">
              Changes saved. The vehicle is now on version {banner.version}.
            </Alert>
          )}
          {banner?.kind === "refreshed" && (
            <Alert tone="info" title="Latest version loaded" testId="refreshed-notice">
              Showing version {banner.version}. Re-apply your changes if they&apos;re still needed,
              then save.
            </Alert>
          )}
          {readOnly && (
            <Alert tone="info" icon={Lock} title="Read-only access" testId="readonly-notice">
              Viewer accounts can see vehicle details but can&apos;t change them.
            </Alert>
          )}

          <Card>
            <form onSubmit={onSubmit} noValidate>
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="font-semibold text-slate-900">Vehicle details</h2>
                <p className="text-sm text-slate-500">
                  {readOnly
                    ? "Current details for this vehicle."
                    : "Update the make, model, year, or availability."}
                </p>
              </div>
              <div className="grid gap-5 px-6 py-6 sm:grid-cols-2">
                <Field label="Make" htmlFor="make" error={fieldErrors.make}>
                  <Input
                    id="make"
                    value={form.make}
                    disabled={disabled}
                    maxLength={50}
                    invalid={!!fieldErrors.make}
                    onChange={(e) => setForm({ ...form, make: e.target.value })}
                  />
                </Field>
                <Field label="Model" htmlFor="model" error={fieldErrors.model}>
                  <Input
                    id="model"
                    value={form.model}
                    disabled={disabled}
                    maxLength={50}
                    invalid={!!fieldErrors.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                  />
                </Field>
                <Field label="Year" htmlFor="year" error={fieldErrors.year}>
                  <Input
                    id="year"
                    inputMode="numeric"
                    value={form.year}
                    disabled={disabled}
                    maxLength={4}
                    invalid={!!fieldErrors.year}
                    onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, "") })}
                  />
                </Field>
                <Field label="Availability" htmlFor="status">
                  <Select
                    id="status"
                    value={form.status}
                    disabled={disabled}
                    onChange={(e) => setForm({ ...form, status: e.target.value as VehicleStatus })}
                  >
                    {VEHICLE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {!readOnly && (
                <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">
                    Editing from version {vehicle.version}. If someone saves first, you&apos;ll be
                    asked to refresh.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      icon={RotateCcw}
                      disabled={!dirty || disabled}
                      onClick={() => {
                        setForm(toForm(vehicle));
                        setFieldErrors({});
                      }}
                    >
                      Discard
                    </Button>
                    <Button
                      type="submit"
                      icon={Save}
                      loading={saving}
                      disabled={!dirty || inConflict}
                    >
                      Save changes
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </Card>
        </div>

        <aside>
          <Card className="divide-y divide-slate-100">
            <div className="px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Record</h2>
            </div>
            <dl className="space-y-4 px-5 py-4 text-sm">
              <div className="flex items-start gap-3">
                <Tag className="mt-0.5 size-4 text-slate-400" aria-hidden />
                <div>
                  <dt className="text-slate-500">Stock number</dt>
                  <dd className="font-mono text-slate-900">{vehicle.stock_number}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <History className="mt-0.5 size-4 text-slate-400" aria-hidden />
                <div>
                  <dt className="text-slate-500">Version</dt>
                  <dd className="text-slate-900" data-testid="vehicle-version">
                    {vehicle.version}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 size-4 text-slate-400" aria-hidden />
                <div>
                  <dt className="text-slate-500">Last updated</dt>
                  <dd className="text-slate-900" title={absoluteTime(vehicle.updated_at)}>
                    {relativeTime(vehicle.updated_at)}
                    {vehicle.updated_by_name && (
                      <span className="block text-xs text-slate-500">
                        by {vehicle.updated_by_name}
                      </span>
                    )}
                  </dd>
                </div>
              </div>
            </dl>
            <div className="px-5 py-4 text-xs leading-relaxed text-slate-500">
              Every save increases the version by one. A save based on an older version is
              rejected so concurrent edits never overwrite each other.
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function EditVehicleRoute() {
  const id = useSearchParams().get("id");
  if (!id) {
    return (
      <Alert tone="warning" title="No vehicle selected">
        Choose a vehicle from the{" "}
        <Link href="/vehicles/" className="font-medium underline">
          inventory
        </Link>
        .
      </Alert>
    );
  }
  // key: switching ?id= remounts with fresh state
  return <EditVehicle key={id} id={id} />;
}

export default function EditVehiclePage() {
  return (
    <AppShell>
      <Suspense fallback={<FullPageSpinner />}>
        <EditVehicleRoute />
      </Suspense>
    </AppShell>
  );
}
