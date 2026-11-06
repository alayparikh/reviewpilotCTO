import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DemoChip, Nav, SourceBadge, Stars } from "~/components/ui";
import type { Tone } from "~/lib/types";
import { TONES, formatDate } from "~/lib/types";
import {
  analyzeBusiness,
  searchPlacesQuery,
} from "~/lib/server/api";
import type {
  AnalyzePlaceInput,
  AnalyzeResult,
  SearchPlacesResult,
} from "~/lib/server/api";

export const Route = createFileRoute("/analyze")({
  component: AnalyzePage,
});

interface Candidate {
  id?: string;
  name: string;
  fullAddress?: string;
  rating?: number;
  reviewsCount?: number;
  query: string;
}

interface Choice {
  label: string; // "Your business" | "Competitor"
  name: string;
  candidates: Candidate[];
  selected: number;
}

function placeToInput(choice: Choice): AnalyzePlaceInput {
  const c = choice.candidates[choice.selected];
  return {
    query: c.query,
    label: c.name,
    placeId: c.id,
    googleRating: c.rating,
  };
}

function AnalyzePage() {
  // Form state
  const [businessName, setBusinessName] = useState("");
  const [businessLoc, setBusinessLoc] = useState("");
  const [compName, setCompName] = useState("");
  const [compLoc, setCompLoc] = useState("");
  const [tone, setTone] = useState<Tone>("Friendly");

  const [phase, setPhase] = useState<"form" | "disambiguate" | "results">("form");
  const [running, setRunning] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  const needsCompetitor = Boolean(compName.trim());

  const buildChoices = async () => {
    const businessRes: SearchPlacesResult = await searchPlacesQuery({
      data: { query: businessName.trim(), locationHint: businessLoc.trim() || undefined },
    });
    if (businessRes.error) {
      setMessage(`⚠️ ${businessRes.error}`);
      return null;
    }
    if (businessRes.places.length === 0) {
      setMessage("⚠️ No business found on Google for that name. Try adding a city or ZIP.");
      return null;
    }
    const biz: Choice = {
      label: "Your business",
      name: businessRes.places[0].name,
      candidates: businessRes.places,
      selected: 0,
    };

    let comp: Choice | null = null;
    if (needsCompetitor) {
      const compRes: SearchPlacesResult = await searchPlacesQuery({
        data: { query: compName.trim(), locationHint: compLoc.trim() || undefined },
      });
      if (compRes.error) {
        setMessage(`⚠️ ${compRes.error}`);
        return null;
      }
      if (compRes.places.length === 0) {
        setMessage("⚠️ No competitor found on Google for that name. Try adding a city or ZIP.");
        return null;
      }
      comp = {
        label: "Competitor",
        name: compRes.places[0].name,
        candidates: compRes.places,
        selected: 0,
      };
    }

    const all = comp ? [biz, comp] : [biz];
    const needsPick = all.some((c) => c.candidates.length > 1);
    if (needsPick) {
      setChoices(all);
      setPhase("disambiguate");
      return null;
    }
    return all;
  };

  const submit = async () => {
    if (!businessName.trim()) {
      setMessage("⚠️ Enter your business name.");
      return;
    }
    setMessage(null);
    setRunning(true);
    setProgressText(`Finding ${businessName.trim()} on Google…`);
    try {
      const all = await buildChoices();
      if (all) await runAnalysis(all);
    } finally {
      setRunning(false);
      setProgressText("");
    }
  };

  const runAnalysis = async (choicesToRun: Choice[]) => {
    setRunning(true);
    setProgressText("Fetching reviews and generating insights…");
    setMessage(null);
    try {
      const req = {
        business: placeToInput(choicesToRun.find((c) => c.label === "Your business")!),
        competitor: needsCompetitor
          ? placeToInput(choicesToRun.find((c) => c.label === "Competitor")!)
          : undefined,
        tone,
      };
      const res = await analyzeBusiness({ data: req });
      setResult(res);
      setPhase("results");
    } finally {
      setRunning(false);
      setProgressText("");
    }
  };

  const confirmDisambiguation = () => {
    runAnalysis(choices);
  };

  return (
    <div className="min-h-dvh bg-gray-50">
      <Nav active="analyze" />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Analyze your reviews</h1>
        <p className="mt-1 text-sm text-gray-500">
          See what customers praise, what to fix, and get a ready-to-send reply for every review.
        </p>

        {/* -------- Form card -------- */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400">Your business</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-gray-500">Business name</span>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Acme Coffee"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-500">
                City or ZIP <span className="font-normal text-gray-400">(optional)</span>
              </span>
              <input
                type="text"
                value={businessLoc}
                onChange={(e) => setBusinessLoc(e.target.value)}
                placeholder="Dunwoody, GA"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Helps tell apart chain locations that share a name on Google. No full address needed.
          </p>

          <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-gray-400">
            Competitor <span className="font-normal normal-case text-gray-400">— optional</span>
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-gray-500">Business name</span>
              <input
                type="text"
                value={compName}
                onChange={(e) => setCompName(e.target.value)}
                placeholder="e.g. Coffee House"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-500">
                City or ZIP <span className="font-normal text-gray-400">(optional)</span>
              </span>
              <input
                type="text"
                value={compLoc}
                onChange={(e) => setCompLoc(e.target.value)}
                placeholder="Marietta, GA"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Leave blank to analyze only your own business.
          </p>

          <div className="mt-5 flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-700">Reply tone</span>
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm font-medium">
              {TONES.map((t: Tone) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  className={`rounded-md px-3 py-1.5 transition-colors ${
                    tone === t ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={submit}
              disabled={running}
              className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? "Analyzing…" : "Analyze reviews"}
            </button>
            {running && <span className="text-sm text-gray-500">{progressText}</span>}
          </div>

          {message && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {message}
            </div>
          )}
        </section>

        {/* -------- Disambiguation -------- */}
        {phase === "disambiguate" && (
          <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-bold text-gray-900">Which location did you mean?</h2>
            <p className="mt-1 text-sm text-gray-500">
              More than one Google listing matched. Pick the right one for each.
            </p>
            {choices.map((choice) => (
              <fieldset key={choice.label} className="mt-5">
                <legend className="text-sm font-bold text-gray-700">{choice.label}</legend>
                <ul className="mt-2 space-y-2">
                  {choice.candidates.map((c, i) => (
                    <li key={`${choice.label}-${i}`}>
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                          choice.selected === i
                            ? "border-indigo-400 bg-indigo-50"
                            : "border-gray-200 hover:border-indigo-200"
                        }`}
                      >
                        <input
                          type="radio"
                          name={choice.label}
                          checked={choice.selected === i}
                          onChange={() =>
                            setChoices((prev) =>
                              prev.map((p) =>
                                p.label === choice.label ? { ...p, selected: i } : p,
                              ),
                            )
                          }
                          className="mt-1 h-4 w-4 text-indigo-600"
                        />
                        <span className="flex-1">
                          <span className="block font-semibold text-gray-800">{c.name}</span>
                          {c.fullAddress && (
                            <span className="block text-sm text-gray-500">{c.fullAddress}</span>
                          )}
                          <span className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                            <Stars rating={Math.round(c.rating ?? 0)} size="sm" />
                            {c.reviewsCount != null && `${c.reviewsCount} reviews`}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ))}
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={confirmDisambiguation}
                disabled={running}
                className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                {running ? "Analyzing…" : "Continue"}
              </button>
              {running && <span className="text-sm text-gray-500">{progressText}</span>}
            </div>
          </section>
        )}

        {/* -------- Results -------- */}
        {phase === "results" && result && <Results result={result} />}
      </main>
    </div>
  );
}

/* ================= Results rendering ================= */

function Results({ result }: { result: AnalyzeResult }) {
  const b = result.business;
  const demoAny = result.demo || b.reviews.some((r) => (r.source ?? "demo") !== "google");

  return (
    <div className="mt-8 space-y-6">
      {demoAny && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          <span className="font-semibold">Demo analysis.</span> Connect your Google review data source
          and AI provider in Settings for live data. Results below use clearly-labeled demo fallbacks.
        </div>
      )}
      {result.error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ {result.error}
        </div>
      )}

      {/* At a glance */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400">At a glance</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs font-semibold text-gray-400">Customer mood</div>
            <span className="mt-1 inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-700">
              {b.mood || "—"}
            </span>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-400">Google rating</div>
            <div className="mt-1 text-2xl font-extrabold text-gray-900">
              {b.googleRating ? b.googleRating.toFixed(1) : "—"}★
            </div>
            <div className="text-xs text-gray-400">{b.reviewCount} recent reviews</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-400">What to fix</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {b.whatToFix.length === 0 && <span className="text-sm text-gray-400">—</span>}
              {b.whatToFix.map((t) => (
                <span key={t} className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Your business vs Competitor comparison */}
      <div className="grid gap-6 lg:grid-cols-2">
        <StatsCard title="Your business" name={b.label} rating={b.googleRating || b.reviewCount ? (b.googleRating || 0) : 0} reviewCount={b.reviewCount} strengths={b.strengths} improvements={b.improvements} />
        {result.competitor ? (
          <StatsCard title="Competitor comparison" name={result.competitor.label} rating={result.competitor.stats.rating} reviewCount={result.competitor.stats.reviewCount} strengths={result.competitor.strengths} improvements={result.competitor.improvements} demo={result.competitor.stats.demo} />
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Competitor comparison</h3>
            <p className="mt-3 text-sm text-gray-500">
              No competitor selected. Enter a competitor's name above and re-run to compare yourself
              against them on Google.
            </p>
          </div>
        )}
      </div>

      {/* Suggestions */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Suggestions to improve</h3>
          {result.demo ? (
            <span className="inline-flex items-center gap-1 rounded bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">
              Demo analysis <DemoChip />
            </span>
          ) : (
            <span className="inline-flex items-center rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
              AI-generated
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">Prioritized actions to earn more positive reviews.</p>
        <div className="mt-4 space-y-3">
          {result.suggestions.length === 0 && (
            <p className="text-sm text-gray-400">No suggestions yet.</p>
          )}
          {result.suggestions.map((g) => (
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
      </section>

      {/* Combined review feed: Your business + Competitor, side by side down the page */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Recent reviews</h3>
        <p className="mt-1 text-sm text-gray-500">
          Both your business's and your competitor's reviews on one page, each tagged so they're
          never confused. Suggested replies are shown for your own reviews only (you don't reply to
          competitors).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {b.reviews.map((r) => {
            const reply = result.replies.find((x) => x.reviewId === r.id);
            return (
              <ReviewCard
                key={r.id}
                kind="your"
                businessLabel={b.label || "Your business"}
                review={r}
                reply={reply}
                replyDemo={reply?.demo ?? false}
              />
            );
          })}
          {result.competitor?.reviews.map((r) => (
            <ReviewCard
              key={r.id}
              kind="competitor"
              businessLabel={result.competitor!.label || "Competitor"}
              review={r}
            />
          ))}
          {b.reviews.length === 0 && (result.competitor?.reviews.length ?? 0) === 0 && (
            <p className="text-sm text-gray-400">No reviews to show yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

const CLAMP_LENGTH = 180;

function ReviewCard({
  kind,
  businessLabel,
  review,
  reply,
  replyDemo = false,
}: {
  kind: "your" | "competitor";
  businessLabel: string;
  review: { id: string; customer: string; rating: number; text: string; date: string; source?: "demo" | "google" };
  reply?: { text?: string } | null;
  replyDemo?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = review.text.length > CLAMP_LENGTH;
  const shown = expanded || !long ? review.text : review.text.slice(0, CLAMP_LENGTH) + "…";
  const isYour = kind === "your";

  return (
    <div className={`rounded-xl border p-4 ${isYour ? "border-indigo-100 bg-indigo-50/40" : "border-gray-200 bg-gray-50"}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
            isYour ? "bg-indigo-600 text-white" : "bg-gray-700 text-white"
          }`}
        >
          {isYour ? "Your business" : "Competitor"}
        </span>
        <span className="text-xs font-semibold text-gray-500">{businessLabel}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-gray-800">{review.customer}</span>
        <Stars rating={review.rating} size="sm" />
        <span className="text-xs text-gray-400">{formatDate(review.date)}</span>
        <span className="ml-auto">
          <SourceBadge source={review.source} />
        </span>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700">{shown}</p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
      {isYour && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide">
            <span className="text-gray-400">Suggested reply</span>
            {replyDemo ? (
              <span className="inline-flex items-center gap-1 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-600">
                Demo reply <DemoChip />
              </span>
            ) : (
              <span className="inline-flex items-center rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
                AI-generated
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm italic text-gray-600">{reply?.text ?? "—"}</p>
        </div>
      )}
    </div>
  );
}

function StatsCard({
  title,
  name,
  rating,
  reviewCount,
  strengths,
  improvements,
  demo,
}: {
  title: string;
  name: string;
  rating: number;
  reviewCount: number;
  strengths: string[];
  improvements: string[];
  demo?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">{title}</h3>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-lg font-bold text-gray-900">{name}</span>
        {demo && <DemoChip>Demo data</DemoChip>}
      </div>
      <div className="mt-3 flex items-center gap-4">
        <div>
          <div className="text-xs font-semibold text-gray-400">Rating</div>
          <div className="text-2xl font-extrabold text-gray-900">
            {rating ? rating.toFixed(1) : "—"}★
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-400">Reviews</div>
          <div className="text-2xl font-extrabold text-gray-900">{reviewCount}</div>
        </div>
      </div>
      {strengths.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-emerald-600">Praised for</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {strengths.map((s) => (
              <span key={s} className="inline-flex items-center rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {improvements.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold text-amber-600">Could improve</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {improvements.map((s) => (
              <span key={s} className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
