import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Page not found</h1>
      <p className="text-slate-600">The page you were looking for doesn&apos;t exist.</p>
      <Link
        href="/vehicles/"
        className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        Back to inventory
      </Link>
    </div>
  );
}
