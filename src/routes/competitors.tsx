import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  DemoBanner,
  DemoChip,
  Nav,
  SourceBadge,
  Stars,
} from "~/components/ui";
import type {
  CompetitiveReport,
  Competitor,
} from "~/lib/types";
import { formatDate } from "~/lib/types";
import {
  analyzeCompetitors,
  fetchCompetitor,
  getCompetitors,
} from "~/lib/server/api";
import type { AnalyzeCompetitorsResult } from "~/lib/server/api";

export const Route = createFileRoute("/competitors")({
  loader: () => getCompetitors(),
  component: CompetitorsPage,
});

interface FetchMsg {
  ok: boolean;
  text: string;
}

function CompetitorsPage() {
  const initial = Route.useLoaderData();
  const [state, setState] = useState(initial);
  const [query, setQuery] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState<FetchMsg | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeCompetitorsResult | null>(null);

  const refresh = async () => setState(await getCompetitors());
  const flag = state.flags;

  const onFetch = async () => {
    const q = query.trim();
    if (!q) {
      setFetchMsg({ ok: false, text: "Enter a competitor business name or address first." });
      return;
    }
    setFetching(true);
    setFetchMsg(null);
    try {
      const res = await fetchCompetitor({ data: { query: q } });
      if (res.error) {
        setFetchMsg({ ok: false, text: res.error });
      } else {
        const n = res.competitor?.reviews.length ?? 0;
        setFetchMsg({
          ok: true,
          text: `${res.added ? "Added" : "Updated"} ${res.competitor?.query ?? q} — fetched ${n} review${n === 1 ? "" : "s"} from Google.`,
        });
      }
      await refresh();
    } finally {
      setFetching(false);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onAnalyze = async () => {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const ids = selected.size > 0 ? [...selected] : undefined;
      const res = await analyzeCompetitors({ data: { competitorIds: ids } });
      setAnalysis(res);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-dvh bg-gray-50">
      <Nav active="competitors" />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Competitive Review Intelligence</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pull your competitors' Google reviews, compare them to your own, and get concrete,
          actionable recommendations for beating them.
        </p>

        {flag.demoMode && (
          <div className="mt-4">
            <DemoBanner>
              <span className="font-semibold">Demo mode.</span> No database is connected — data lives
              in memory and resets on restart. The competitors below are sample demo data unless
              fetched live with a connected review data source.
            </DemoBanner>
          </div>
        )}

        {/* Add competitor */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
              Add a competitor
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  flag.reviewsSourceConnected
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {flag.reviewsSourceConnected ? "Google connected" : "Google not connected"}
              </span>
            </h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Enter a competitor's business name or address — the same Google review fetch the
            dashboard uses.
          </p>

          {!flag.reviewsSourceConnected && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠️ REVIEWS_API_KEY is not set — real competitor fetching is disabled. Use the seeded
              demo competitors below (labeled Demo data) to try the feature, or set the key in
              Settings to fetch real reviews.
            </p>
          )}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onFetch()}
              placeholder="e.g. Olive Grove Trattoria, Brooklyn, NY"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none"
            />
            <button
              onClick={onFetch}
              disabled={fetching || !flag.reviewsSourceConnected}
              className="shrink-0 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {fetching ? "Fetching…" : "Fetch reviews"}
            </button>
          </div>

          {fetchMsg && (
            <div
              className={`mt-3 rounded-xl border px-4 py-3 text-sm ${
                fetchMsg.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {fetchMsg.ok ? "✓ " : "⚠️ "}
              {fetchMsg.text}
            </div>
          )}
        </section>

        {/* Competitor list */}
        <section className="mt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold text-gray-900">
              Competitors{" "}
              <span className="ml-1 text-sm font-normal text-gray-400">
                {state.competitors.length} added
              </span>
            </h2>
            <button
              onClick={onAnalyze}
              disabled={analyzing || state.competitors.length === 0}
              className="shrink-0 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {analyzing ? "Analyzing…" : "Analyze vs competitors"}
            </button>
          </div>

          {state.competitors.length === 0 && (
            <p className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-400">
              No competitors yet. Add one above to start, or run the analysis with the seeded demo
              competitors.
            </p>
          )}

          <ul className="mt-4 space-y-3">
            {state.competitors.map((c) => (
              <CompetitorCard
                key={c.id}
                competitor={c}
                expanded={expanded.has(c.id)}
                onToggle={() => toggleExpanded(c.id)}
                checked={selected.has(c.id)}
                onCheck={() => toggleSelected(c.id)}
              />
            ))}
          </ul>

          {state.competitors.length > 0 && (
            <p className="mt-3 text-xs text-gray-400">
              Select specific competitors to analyze, or analyze all (default).
            </p>
          )}
        </section>

        {/* Analysis report */}
        <section className="mt-8">
          {analysis && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-gray-900">Competitive analysis</h2>
                {analysis.demo ? (
                  <span className="inline-flex items-center gap-1 rounded bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">
                    Demo analysis <DemoChip />
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                    AI-generated
                  </span>
                )}
              </div>

              {analysis.demo && (
                <div className="mt-3 rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-800">
                  <span className="font-semibold">Demo analysis —</span> connect an AI provider key
                  for real AI-generated competitive insights. The report below is generated locally
                  from the actual review themes, not by an AI model.
                </div>
              )}

              {analysis.error && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  ⚠️ {analysis.error}
                </p>
              )}

              <ReportView report={analysis.report} />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function CompetitorCard({
  competitor,
  expanded,
  onToggle,
  checked,
  onCheck,
}: {
  competitor: Competitor;
  expanded: boolean;
  onToggle: () => void;
  checked: boolean;
  onCheck: () => void;
}) {
  const total = competitor.reviews.length;
  const avg =
    total > 0
      ? (competitor.reviews.reduce((a, r) => a + r.rating, 0) / total).toFixed(1)
      : "—";
  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <input
          type="checkbox"
          checked={checked}
          onChange={onCheck}
          aria-label={`Include ${competitor.name ?? competitor.query} in analysis`}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <button onClick={onToggle} className="flex items-center gap-2 text-left">
          <span className="text-lg font-bold text-gray-900">{competitor.name ?? competitor.query}</span>
          <span className="text-xs text-gray-400">
            {avg}★ avg · {total} review{total === 1 ? "" : "s"}
          </span>
        </button>
        {competitor.demo && <DemoChip>Demo data</DemoChip>}
        <button onClick={onToggle} className="ml-auto text-sm font-medium text-indigo-600 hover:underline">
          {expanded ? "Hide reviews" : "Show reviews"}
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-400">Query: "{competitor.query}" · fetched {formatDate(competitor.fetchedAt)}</p>

      {expanded && (
        <ul className="mt-4 space-y-3">
          {competitor.reviews.length === 0 && (
            <li className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
              No reviews stored for this competitor.
            </li>
          )}
          {competitor.reviews.map((r) => (
            <li key={r.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-gray-800">{r.customer}</span>
                <Stars rating={r.rating} size="sm" />
                <span className="text-xs text-gray-400">{formatDate(r.date)}</span>
                <span className="ml-auto">
                  <SourceBadge source={r.source} />
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-gray-700">{r.text}</p>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ReportView({ report }: { report: CompetitiveReport }) {
  if (!report || (!report.summary && !report.strengths.length && !report.recommendations.length)) {
    return <p className="mt-4 text-sm text-gray-500">No report to show yet.</p>;
  }
  return (
    <div className="mt-4 space-y-6">
      {report.summary && (
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Overview</h3>
          <p className="mt-1 text-sm leading-relaxed text-gray-700">{report.summary}</p>
        </div>
      )}

      {report.strengths.length > 0 && (
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-600">
            What competitors do well
          </h3>
          <div className="mt-2 space-y-3">
            {report.strengths.map((s) => (
              <div key={s.name} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                <p className="text-sm font-bold text-gray-800">{s.name}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  {s.points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.weaknesses.length > 0 && (
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-amber-600">
            Competitor weaknesses (and which you share)
          </h3>
          <div className="mt-2 space-y-3">
            {report.weaknesses.map((w) => (
              <div key={w.name} className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                <p className="text-sm font-bold text-gray-800">{w.name}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  {w.points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
                {w.sharedWithOwner.length > 0 && (
                  <p className="mt-2 text-xs text-amber-800">
                    <span className="font-semibold">You share these:</span> {w.sharedWithOwner.join("; ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {report.recommendations.length > 0 && (
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-indigo-600">
            Recommendations for you
          </h3>
          <div className="mt-2 space-y-3">
            {report.recommendations.map((g) => (
              <div key={g.theme} className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                <p className="text-sm font-bold text-gray-800">{g.theme}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  {g.items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
