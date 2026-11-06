import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

// ---------- Stars ----------

export function Stars({ rating, size = "md" }: { rating: number; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-base";
  return (
    <span className={`inline-flex items-center gap-0.5 ${cls}`} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= rating ? "text-amber-400" : "text-gray-300"}>
          ★
        </span>
      ))}
    </span>
  );
}

// ---------- Toggle switch ----------

export function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-emerald-500" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// ---------- Badges ----------

export function StatusBadge({ status }: { status: "new" | "answered" }) {
  return status === "new" ? (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
      Unanswered
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
      Answered (draft)
    </span>
  );
}

export function DemoChip({ children = "Demo" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
      {children}
    </span>
  );
}

/**
 * Where a review came from. google = fetched from Google and is
 * real customer data; anything else is seeded sample data and is labeled as
 * such so it is never mistaken for a real review.
 */
export function SourceBadge({ source }: { source?: "demo" | "google" }) {
  return source === "google" ? (
    <span className="inline-flex items-center rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700">
      Google
    </span>
  ) : (
    <DemoChip>Demo data</DemoChip>
  );
}

export function AIBadge({ real }: { real: boolean }) {
  return real ? (
    <span className="inline-flex items-center rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
      AI-generated
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">
      Demo reply
      <DemoChip />
    </span>
  );
}

// ---------- Banner ----------

export function DemoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span className="text-lg">⚠️</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ---------- Navigation ----------

export function Nav({ active }: { active?: "dashboard" | "competitors" | "settings" | "analyze" }) {
  const linkCls = (name: string) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active === name ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    }`;
  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-black text-white">
            RP
          </span>
          <span className="text-lg font-bold tracking-tight text-gray-900">ReviewPilot</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link to="/analyze" className={linkCls("analyze")}>
            Analyze
          </Link>
          <Link to="/dashboard" className={linkCls("dashboard")}>
            Dashboard
          </Link>
          <Link to="/competitors" className={linkCls("competitors")}>
            Competitors
          </Link>
          <Link to="/settings" className={linkCls("settings")}>
            Settings
          </Link>
        </nav>
      </div>
    </header>
  );
}
