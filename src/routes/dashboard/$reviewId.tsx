import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AIBadge, DemoBanner, Nav, SourceBadge, Stars, StatusBadge } from "~/components/ui";
import type { DraftResult, Review, Tone } from "~/lib/types";
import { TONES, formatDateTime } from "~/lib/types";
import { getReplyDraft, getReviewDetail, saveReply } from "~/lib/server/api";

export const Route = createFileRoute("/dashboard/$reviewId")({
  loader: ({ params }) => getReviewDetail({ data: { id: params.reviewId } }),
  component: ReviewDetail,
});

function ReviewDetail() {
  const { reviewId } = Route.useParams();
  const initial = Route.useLoaderData();
  const [review, setReview] = useState<Review | null>(initial.review);
  const [flags, setFlags] = useState(initial.flags);
  const [settings, setSettings] = useState(initial.settings);
  const [tone, setTone] = useState<Tone>(initial.settings.defaultTone);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadDraft = useCallback(
    async (t: Tone) => {
      setLoadingDraft(true);
      try {
        const d = await getReplyDraft({ data: { id: reviewId, tone: t } });
        setDraft(d);
      } catch {
        setDraft(null);
      } finally {
        setLoadingDraft(false);
      }
    },
    [reviewId],
  );

  // Initial draft on mount.
  useEffect(() => {
    void loadDraft(settings.defaultTone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Regenerate when the tone changes.
  useEffect(() => {
    void loadDraft(tone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tone]);

  // Light polling: if automation answers this review while it's open, reflect it.
  useEffect(() => {
    const timer = setInterval(() => {
      getReviewDetail({ data: { id: reviewId } })
        .then((res) => {
          setReview(res.review);
          setFlags(res.flags);
          setSettings(res.settings);
        })
        .catch(() => {});
    }, 15_000);
    return () => clearInterval(timer);
  }, [reviewId]);

  const onSave = async () => {
    setSaving(true);
    try {
      const res = await saveReply({ data: { id: reviewId, tone } });
      setReview(res.review);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (!review) {
    return (
      <div className="min-h-dvh bg-gray-50">
        <Nav />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-gray-500">Review not found.</p>
          <Link to="/dashboard" className="mt-4 inline-block font-medium text-indigo-600 hover:underline">
            ← Back to dashboard
          </Link>
        </main>
      </div>
    );
  }

  const demoReplyNote =
    draft?.demo && !flags.aiConnected
      ? "Demo reply — connect an AI provider key for real AI-generated responses."
      : draft?.demo
        ? "The AI provider call failed, so a demo reply is shown instead."
        : null;

  return (
    <div className="min-h-dvh bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link
          to="/dashboard"
          className="inline-block text-sm font-medium text-indigo-600 hover:underline"
        >
          ← Back to dashboard
        </Link>
        {flags.demoMode && (
          <div className="mt-4">
            <DemoBanner>
              <span className="font-semibold">Demo mode.</span> This is a sample review — any reply
              drafted here is a draft, and posting to Google comes in a later phase.
            </DemoBanner>
          </div>
        )}
        {/* Customer review */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-lg font-bold text-gray-900">{review.customer}</span>
            <Stars rating={review.rating} />
            <span className="text-sm text-gray-400">{formatDateTime(review.date)}</span>
            <span className="ml-auto flex items-center gap-2">
              <SourceBadge source={review.source} />
              <StatusBadge status={review.status} />
            </span>
          </div>
          <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-gray-800">
            {review.text}
          </p>
        </section>
        {/* Drafted reply, if already answered */}
        {review.status === "answered" && review.reply && (
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-emerald-700">
              Drafted reply
              <span className="normal-case">
                {review.replyDemo ? <AIBadge real={false} /> : <AIBadge real={true} />}
              </span>
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-800">{review.reply}</p>
            <p className="mt-3 text-xs text-gray-500">
              Drafted {formatDateTime(review.repliedAt ?? "")}
              {review.replyTone ? ` · tone: ${review.replyTone}` : ""} · not posted to Google —
              posting comes in a later phase
            </p>
          </section>
        )}
        {/* Reply draft */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">Reply draft</h2>
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm font-medium">
              {TONES.map((t) => (
                <button
                  key={t}
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
          <div className="mt-4">
            {loadingDraft || !draft ? (
              <div className="flex h-32 animate-pulse items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400">
                Drafting reply…
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <AIBadge real={!draft.demo} />
                    <span className="text-xs text-gray-400">tone: {draft.tone}</span>
                  </div>
                  <p className="whitespace-pre-line text-[15px] leading-relaxed text-gray-800">
                    {draft.text}
                  </p>
                </div>
                {demoReplyNote && (
                  <p className="mt-2 text-xs text-amber-700">
                    ⚠️ {demoReplyNote}
                    {draft.error ? <span className="text-gray-400"> ({draft.error})</span> : null}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="mt-5 flex items-center gap-3">
            {review.status === "new" ? (
              settings.automationOn ? (
                <p className="text-sm text-gray-500">
                  <span className="font-semibold text-emerald-700">Automation is ON</span> — this
                  review will be drafted and answered automatically. No action needed.
                </p>
              ) : (
                <>
                  <button
                    onClick={onSave}
                    disabled={saving || loadingDraft}
                    className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Generating…" : "Generate reply"}
                  </button>
                  <span className="text-xs text-gray-400">
                    Creates a draft reply — nothing is posted to Google yet. Posting comes in a
                    later phase.
                  </span>
                </>
              )
            ) : (
              <p className="text-sm text-gray-500">
                {saved
                  ? "✓ Reply generated and saved as a draft."
                  : "This review already has a drafted reply — the draft above is a preview. Use the tone selector to preview other styles."}
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
