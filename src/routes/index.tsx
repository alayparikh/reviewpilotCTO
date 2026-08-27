import { createFileRoute, Link } from "@tanstack/react-router";
import { getAppState } from "~/lib/server/api";
import { DemoChip } from "~/components/ui";

export const Route = createFileRoute("/")({
  loader: () => getAppState(),
  component: Landing,
});

const VALUE_PROPS = [
  {
    icon: "🔗",
    title: "Pulls your Google reviews automatically",
    body: "Every new Google review lands in your dashboard the moment it's posted — no manual checking, no missed feedback.",
  },
  {
    icon: "✍️",
    title: "AI writes on-brand replies to every review",
    body: "Each reply is tailored to what the customer actually said, in the tone you choose — friendly, professional, or warm.",
  },
  {
    icon: "🚀",
    title: "Automation drafts them for you",
    body: "Flip the master toggle and ReviewPilot drafts replies around the clock — or keep it off and approve each one yourself. Posting to Google comes in a later phase.",
  },
  {
    icon: "🔎",
    title: "Competitive review intelligence",
    body: "Pull your competitors' Google reviews and see what they do better — with concrete, actionable recommendations to outshine them.",
  },
];

function Landing() {
  const state = Route.useLoaderData();
  return (
    <div className="min-h-dvh bg-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-black text-white">
            RP
          </span>
          <span className="text-lg font-bold tracking-tight text-gray-900">ReviewPilot</span>
        </div>
        <Link
          to="/dashboard"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          Open dashboard
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <section className="flex flex-col items-center gap-6 pb-16 pt-20 text-center">
          {state.flags.demoMode && (
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
              <DemoChip /> Preview with sample data
            </span>
          )}
          <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-gray-900 sm:text-6xl">
            Never leave a customer review unanswered
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-gray-600">
            ReviewPilot pulls your Google reviews and drafts a thoughtful, on-brand reply to every
            single one with AI — automatically, so a great review gets the thank-you it deserves
            and a bad one gets fixed fast.
          </p>
          <Link
            to="/dashboard"
            className="rounded-xl bg-indigo-600 px-8 py-3.5 text-lg font-semibold text-white shadow-lg shadow-indigo-600/20 transition-colors hover:bg-indigo-700"
          >
            Try the demo dashboard →
          </Link>
          <Link
            to="/analyze"
            className="rounded-xl border-2 border-indigo-600 px-8 py-3.5 text-lg font-semibold text-indigo-700 transition-colors hover:bg-indigo-50"
          >
            Analyze your reviews →
          </Link>
        </section>

        <section className="grid gap-6 pb-20 sm:grid-cols-2 lg:grid-cols-4">
          {VALUE_PROPS.map((vp) => (
            <div
              key={vp.title}
              className="rounded-2xl border border-gray-200 bg-gray-50 p-6 transition-shadow hover:shadow-md"
            >
              <div className="mb-3 text-3xl">{vp.icon}</div>
              <h2 className="mb-2 text-lg font-bold text-gray-900">{vp.title}</h2>
              <p className="text-sm leading-relaxed text-gray-600">{vp.body}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl bg-gray-900 px-6 py-12 text-center sm:px-12">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Every review deserves an answer.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-gray-300">
            See how it works — explore a live demo feed, watch the AI draft replies, and flip the
            automation toggle.
          </p>
          <Link
            to="/dashboard"
            className="mt-6 inline-block rounded-xl bg-white px-6 py-3 font-semibold text-gray-900 transition-colors hover:bg-gray-100"
          >
            Go to dashboard
          </Link>
        </section>
      </main>

      <footer className="border-t border-gray-200 py-8 text-center text-sm text-gray-400">
        ReviewPilot · demo preview — reviews and replies shown are sample data, not real customer
        feedback.
      </footer>
    </div>
  );
}
