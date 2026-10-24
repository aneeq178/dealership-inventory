const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function relativeTime(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (Math.abs(seconds) < 45) return "just now";
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(Math.round(seconds / 60), "minute");
}

export function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString("en", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function vehicleTitle(v: { year: number; make: string; model: string }): string {
  return `${v.year} ${v.make} ${v.model}`;
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};
