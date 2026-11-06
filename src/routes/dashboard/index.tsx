import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DemoBanner, Nav, SourceBadge, Stars, StatusBadge, Toggle } from "~/components/ui";
import type { AppState } from "~/lib/types";
import { timeAgo } from "~/lib/types";
import { fetchReviewsNow, getAppState, setAutomation } from "~/lib/server/api";

export const Route = createFileRoute("/dashboard/")({
  loader: () => getAppState(),
  component: Dashboard,
});

type Filter = "all" | "new" | "answered";

/** Tab labels shown to the owner. Internal status values stay "new"/"answered". */
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "Unanswered" },
  { value: "answered", label: "Answered" },
];

function filterLabel(f: Filter): string {
  return FILTERS.find((x) => x.value === f)?.label ?? f;
}

interface FetchMsg {
  ok: boolean;
  text: string;
}

function Dashboard() {
  const initial = Route.useLoaderData();
  const [state, setState] = useState<AppState>(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [toggling, setToggling] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [fetchMsg, setFetchMsg] = useState<FetchMsg | null>(null);

  // Poll so automation-driven changes (and demo "posting") appear without a refresh.
  useEffect(() => {
    const timer = setInterval(() => {
      getAppState()
        .then(setState)
        .catch(() => {});
    }, 10_000);
    return () => clearInterval(timer);
  }, []);

  const onToggle = async (on: boolean) => {
    setToggling(true);
    setNotice(null);
    try {
      const res = await setAutomation({ data: { on } });
      if (on && res.answeredNow > 0) {
        setNotice(
          `Automation is ON — ${res.answeredNow} review${res.answeredNow > 1 ? "s were" : " was"} drafted and answered just now.`,
        );
      }
      setState(await getAppState());
    } finally {
      setToggling(false);
    }
  };

  const onFetch = async () => {
    setFetching(true);
    setFetchMsg(null);
    try {
      const res = await fetchReviewsNow();
      if (res.error) {
        setFetchMsg({ ok: false, text: res.error });
      } else {
        setFetchMsg({
          ok: true,
          text: `Fetched ${res.added} review${res.added === 1 ? "" : "s"} from Google.`,
        });
      }
      setState(await getAppState());
    } finally {
      setFetching(false);
    }
  };

  const newCount = state.reviews.filter((r) => r.status === "new").length;
  const answeredCount = state.reviews.length - newCount;
  const filterCount = (f: Filter) =>
    f === "all" ? state.reviews.length : f === "new" ? newCount : answeredCount;
  const filtered = state.reviews.filter((r) => filter === "all" || r.status === filter);
  const hasBusinessQuery = Boolean((state.settings.businessQuery ?? "").trim());

  return (
    <div className="min-h-dvh bg-gray-50">
      <Nav active="dashboard" />
      <main className="mx-auto max-w-5xl px-4 py-8">
        {state.flags.demoMode && (
          <DemoBanner>
            <span className="font-semibold">Demo mode.</span> Showing sample reviews stored in
            memory — they are labeled Demo data and are never presented as real customer reviews.
            Replies here are drafts; posting to Google comes in a later phase. Connect a database
            and an AI provider in Settings to go live.
          </DemoBanner>
        )}

        {/* Automation toggle */}
        <section className="mt-6 flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              Automation engine
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  state.settings.automationOn
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {state.settings.automationOn ? "ON" : "OFF"}
              </span>
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {state.settings.automationOn
                ? "New reviews are drafted and answered automatically. Posting replies to Google comes in a later phase."
                : "New reviews wait for your approval — open one to draft a reply."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Toggle checked={state.settings.automationOn} onChange={onToggle} disabled={toggling} label="Automation toggle" />
            <span className="text-sm font-medium text-gray-700">
              {state.settings.automationOn ? "On" : "Off"}
            </span>
          </div>
        </section>

        {notice && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            ✓ {notice}
          </div>
        )}

        {/* Google reviews fetch */}
        <section className="mt-6 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
              Google reviews
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  state.flags.reviewsSourceConnected
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {state.flags.reviewsSourceConnected ? "Google connected" : "Google not connected"}
              </span>
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {hasBusinessQuery ? (
                <>
                  Fetching reviews for{" "}
                  <span className="font-medium text-gray-700">"{state.settings.businessQuery}"</span>
                </>
              ) : (
                <>
                  Set a business name or address in{" "}
                  <Link to="/settings" className="font-medium text-indigo-600 hover:underline">
                    Settings
                  </Link>{" "}
                  to fetch real Google reviews.
                </>
              )}
            </p>
          </div>
          <button
            onClick={onFetch}
            disabled={fetching}
            className="shrink-0 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {fetching ? "Fetching…" : "Fetch reviews now"}
          </button>
        </section>

        {fetchMsg && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              fetchMsg.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {fetchMsg.ok ? "✓ " : "⚠️ "}
            {fetchMsg.text}
          </div>
        )}

        {/* Feed */}
        <section className="mt-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-bold text-gray-900">
              Reviews{" "}
              <span className="ml-1 text-sm font-normal text-gray-400">
                {newCount} unanswered · {answeredCount} answered
              </span>
            </h2>
            <div className="flex rounded-lg border border-gray-200 bg-white p-1 text-sm font-medium">
              {FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`rounded-md px-3 py-1.5 transition-colors ${
                    filter === value ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {label} ({filterCount(value)})
                </button>
              ))}
            </div>
          </div>

          <ul className="mt-4 space-y-3">
            {filtered.length === 0 && (
              <li className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-400">
                No {filter === "all" ? "" : filterLabel(filter).toLowerCase() + " "}reviews here.
              </li>
            )}
            {filtered.map((review) => (
              <li key={review.id}>
                <Link
                  to="/dashboard/$reviewId"
                  params={{ reviewId: review.id }}
                  className="block rounded-2xl border border-gray-200 bg-white p-5 transition-shadow hover:border-indigo-200 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold text-gray-900">{review.customer}</span>
                    <Stars rating={review.rating} size="sm" />
                    <span className="text-xs text-gray-400">{timeAgo(review.date)}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <SourceBadge source={review.source} />
                      <StatusBadge status={review.status} />
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-700">
                    {review.text}
                  </p>
                  {review.status === "answered" && review.reply && (
                    <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs italic text-gray-500">
                      Draft reply: {review.reply.slice(0, 140)}
                      {review.reply.length > 140 ? "…" : ""}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
