import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DemoBanner, Nav, Toggle } from "~/components/ui";
import type { RespondTo, Settings, Tone } from "~/lib/types";
import { TONES } from "~/lib/types";
import { getAppState, updateSettings } from "~/lib/server/api";

export const Route = createFileRoute("/settings")({
  loader: () => getAppState(),
  component: SettingsPage,
});

function ConnStatus({ connected, label }: { connected: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
        connected ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-gray-400"}`} />
      {label}
    </span>
  );
}

function SettingsPage() {
  const initial = Route.useLoaderData();
  const [flags] = useState(initial.flags);
  const [form, setForm] = useState<Settings>({ ...initial.settings });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await updateSettings({ data: { settings: form } });
      setForm(res.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-gray-50">
      <Nav active="settings" />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect your data sources and tune how ReviewPilot responds.
        </p>

        {flags.demoMode && (
          <div className="mt-4">
            <DemoBanner>
              <span className="font-semibold">Demo mode.</span> No database is connected — settings
              and reviews live in memory and reset on restart. Connect a database and an AI
              provider to use real data.
            </DemoBanner>
          </div>
        )}

        {/* Reviews source (Google) */}
        <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">Reviews source (Google)</h2>
            <ConnStatus
              connected={flags.reviewsSourceConnected}
              label={flags.reviewsSourceConnected ? "Connected" : "Missing"}
            />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            ReviewPilot fetches Google reviews from your connected review data source. Set the{" "}
            <code className="rounded bg-gray-50 px-1.5 py-0.5 font-mono text-xs">REVIEWS_API_KEY</code>{" "}
            environment variable to enable real fetching.
          </p>
          {flags.reviewsSourceConnected ? (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              ✓ REVIEWS_API_KEY is set — "Fetch reviews now" on the dashboard pulls real Google
              reviews.
            </p>
          ) : (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠️ REVIEWS_API_KEY is not set — the dashboard shows seeded demo reviews until a key
              is added. Reviews fetched from Google are labeled "Google" so they are never
              confused with demo data.
            </p>
          )}
          <label className="mt-4 block">
            <span className="text-xs font-semibold text-gray-500">
              Business name or address (used by "Fetch reviews now")
            </span>
            <input
              type="text"
              value={form.businessQuery}
              onChange={(e) => setForm((f) => ({ ...f, businessQuery: e.target.value }))}
              placeholder="e.g. Luigi's Trattoria, Brooklyn, NY"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none"
            />
          </label>
        </section>

        {/* AI provider */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">AI provider</h2>
            <ConnStatus connected={flags.aiConnected} label={flags.aiConnected ? "Connected" : "Missing"} />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            Reply drafts are generated with Anthropic's Claude. Set the{" "}
            <code className="rounded bg-gray-50 px-1.5 py-0.5 font-mono text-xs">ANTHROPIC_API_KEY</code>{" "}
            environment variable to enable real AI-generated replies.
          </p>
          {flags.aiConnected ? (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              ✓ ANTHROPIC_API_KEY is set — reply drafts will be generated by Claude.
            </p>
          ) : (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠️ ANTHROPIC_API_KEY is not set — reply drafts will be clearly-labeled demo templates
              until a key is added.
            </p>
          )}
        </section>

        {/* Posting to Google — later phase */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">Posting replies to Google</h2>
            <ConnStatus connected={false} label="Coming soon" />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            Writing replies directly to your Google Business Profile arrives in a later phase. Until
            then, ReviewPilot drafts replies in your dashboard for you to review and copy — nothing
            is ever posted to Google automatically.
          </p>
        </section>

        {/* Automation preferences */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-bold text-gray-900">Automation preferences</h2>
          <p className="mt-1 text-sm text-gray-500">
            How the automation engine decides which reviews to answer. Automation drafts replies —
            posting to Google comes in a later phase.
          </p>

          <div className="mt-5 space-y-6">
            <label className="block">
              <span className="text-sm font-semibold text-gray-700">Default reply tone</span>
              <div className="mt-2 flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm font-medium">
                {TONES.map((t: Tone) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, defaultTone: t }))}
                    className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${
                      form.defaultTone === t
                        ? "bg-indigo-600 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-gray-700">Reviews to auto-respond to</span>
              <select
                value={form.respondTo}
                onChange={(e) => setForm((f) => ({ ...f, respondTo: e.target.value as RespondTo }))}
                className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800"
              >
                <option value="all">All reviews (1–5★)</option>
                <option value="positive">Only 4–5★ (positive reviews)</option>
                <option value="negative">Only 1–3★ (negative reviews)</option>
              </select>
            </label>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">Auto-respond to 1–2★ reviews</p>
                <p className="text-xs text-gray-500">
                  When off, one- and two-star reviews are held for manual approval.
                </p>
              </div>
              <Toggle
                checked={form.autoRespondLowStars}
                onChange={(on) => setForm((f) => ({ ...f, autoRespondLowStars: on }))}
                label="Auto-respond to low-star reviews"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={save}
                disabled={saving}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save preferences"}
              </button>
              {saved && <span className="text-sm font-medium text-emerald-600">✓ Saved</span>}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
