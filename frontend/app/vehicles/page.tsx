"use client";

import { ChevronRight, Eye, PackageSearch, Pencil, RefreshCw, Search, WifiOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { Alert, Button, Card, Skeleton, StatusBadge, StatusDot } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { absoluteTime, cn, relativeTime, STATUS_LABEL, vehicleTitle } from "@/lib/format";
import { VEHICLE_STATUSES, type Vehicle, type VehicleStatus } from "@/lib/types";

type Filter = "all" | VehicleStatus;

function useVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onLoaded = useCallback((items: Vehicle[]) => {
    setVehicles(items);
    setError(null);
  }, []);

  const onFailed = useCallback((err: unknown) => {
    if (err instanceof DOMException && err.name === "AbortError") return;
    if (err instanceof ApiError && err.status !== 401) setError(err); // 401 -> signed out
  }, []);

  // Initial load: the effect only starts the request; state changes when it settles.
  useEffect(() => {
    const ctrl = new AbortController();
    api.listVehicles(ctrl.signal).then(onLoaded, onFailed);
    return () => ctrl.abort();
  }, [onLoaded, onFailed]);

  const reload = useCallback(() => {
    setRefreshing(true);
    api
      .listVehicles()
      .then(onLoaded, onFailed)
      .finally(() => setRefreshing(false));
  }, [onLoaded, onFailed]);

  return { vehicles, error, refreshing, reload };
}

function StatCard({
  label,
  value,
  status,
  active,
  onClick,
}: {
  label: string;
  value: number | null;
  status?: VehicleStatus;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group rounded-2xl bg-white p-5 text-left shadow-sm ring-1 transition-all",
        active ? "ring-2 ring-brand-500" : "ring-slate-200 hover:ring-slate-300",
      )}
    >
      <p className="flex items-center gap-2 text-sm font-medium text-slate-600">
        {status && <StatusDot status={status} />}
        {label}
      </p>
      {value === null ? (
        <Skeleton className="mt-3 h-8 w-12" />
      ) : (
        <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      )}
    </button>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-slate-100" aria-label="Loading vehicles">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 px-6 py-5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="ml-auto h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

function InventoryContent() {
  const { user } = useAuth();
  const { vehicles, error, refreshing, reload } = useVehicles();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const isAdmin = user?.role === "admin";

  const counts = useMemo(() => {
    if (!vehicles) return null;
    const c = { all: vehicles.length, available: 0, reserved: 0, sold: 0 };
    for (const v of vehicles) c[v.status] += 1;
    return c;
  }, [vehicles]);

  const visible = useMemo(() => {
    if (!vehicles) return [];
    const q = query.trim().toLowerCase();
    return vehicles.filter(
      (v) =>
        (filter === "all" || v.status === filter) &&
        (!q || `${v.stock_number} ${v.year} ${v.make} ${v.model}`.toLowerCase().includes(q)),
    );
  }, [vehicles, filter, query]);

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-600">{user?.dealership.name}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Inventory</h1>
          <p className="mt-1 text-sm text-slate-600">
            {isAdmin
              ? "View and update every vehicle on your lot."
              : "Browse every vehicle on your lot."}
          </p>
        </div>
        <Button
          variant="secondary"
          icon={RefreshCw}
          loading={refreshing && vehicles !== null}
          onClick={reload}
        >
          Refresh
        </Button>
      </div>

      {!isAdmin && (
        <Alert tone="info" icon={Eye} testId="viewer-notice">
          You have <strong>read-only</strong> access. Ask an administrator if a vehicle needs
          updating.
        </Alert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total vehicles"
          value={counts?.all ?? null}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {VEHICLE_STATUSES.map((s) => (
          <StatCard
            key={s}
            label={STATUS_LABEL[s]}
            status={s}
            value={counts?.[s] ?? null}
            active={filter === s}
            onClick={() => setFilter(filter === s ? "all" : s)}
          />
        ))}
      </div>

      {/* List */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
          <div className="relative flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stock #, make, model…"
              aria-label="Search vehicles"
              className="block w-full rounded-lg border-0 bg-slate-50 py-2 pl-9 pr-3 text-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1" role="tablist">
            {(["all", ...VEHICLE_STATUSES] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  filter === f
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                {f === "all" ? "All" : STATUS_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        {error && vehicles === null ? (
          <div className="p-6">
            <Alert
              tone="error"
              icon={error.isNetworkError ? WifiOff : undefined}
              title="Couldn't load inventory"
              testId="inventory-error"
              actions={
                <Button variant="secondary" size="sm" icon={RefreshCw} onClick={reload}>
                  Try again
                </Button>
              }
            >
              {error.message}
            </Alert>
          </div>
        ) : vehicles === null ? (
          <TableSkeleton />
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <PackageSearch className="size-10 text-slate-300" aria-hidden />
            <p className="font-medium text-slate-900">No vehicles match</p>
            <p className="text-sm text-slate-500">Try a different search or status filter.</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="border-b border-slate-200 p-4">
                <Alert tone="warning" title="Showing the last loaded list">
                  {error.message}
                </Alert>
              </div>
            )}
            {/* Desktop table */}
            <table className="hidden w-full text-left text-sm md:table" data-testid="vehicle-table">
              <thead className="bg-slate-50/80 text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">Stock #</th>
                  <th className="px-6 py-3">Vehicle</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Last updated</th>
                  <th className="px-6 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((v) => (
                  <tr
                    key={v.id}
                    data-testid={`vehicle-row-${v.stock_number}`}
                    className="transition-colors hover:bg-slate-50/70"
                  >
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{v.stock_number}</td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-900">{vehicleTitle(v)}</p>
                      <p className="text-xs text-slate-500">Version {v.version}</p>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={v.status} />
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <span title={absoluteTime(v.updated_at)}>{relativeTime(v.updated_at)}</span>
                      {v.updated_by_name && (
                        <span className="block text-xs text-slate-400">by {v.updated_by_name}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/vehicles/edit/?id=${v.id}`}
                        aria-label={`${isAdmin ? "Edit" : "View"} ${vehicleTitle(v)}`}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                          isAdmin
                            ? "text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50"
                            : "text-slate-600 hover:bg-slate-100",
                        )}
                      >
                        {isAdmin ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
                        {isAdmin ? "Edit" : "View"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {visible.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/vehicles/edit/?id=${v.id}`}
                    className="flex items-center gap-4 px-4 py-4 hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-slate-500">{v.stock_number}</p>
                      <p className="truncate font-medium text-slate-900">{vehicleTitle(v)}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <StatusBadge status={v.status} />
                        <span className="text-xs text-slate-400">v{v.version}</span>
                      </div>
                    </div>
                    <ChevronRight className="size-5 text-slate-300" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

export default function VehiclesPage() {
  return (
    <AppShell>
      <InventoryContent />
    </AppShell>
  );
}
