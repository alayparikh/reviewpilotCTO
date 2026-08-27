// Server-only competitive intelligence analysis for ReviewPilot.
//
// Compares the OWNER's own Google reviews against COMPETITORS' Google reviews
// and produces structured, actionable insights. Modeled on ./ai.ts:
//   - If ANTHROPIC_API_KEY is present, calls Anthropic's Messages API.
//   - Otherwise (or on failure) returns a clearly-labeled demo report built
//     from the real extracted review themes. Demo reports are flagged
//     `demo: true` so the UI can label them — never presented as real AI.
//
// Never throws: any failure degrades to a labeled demo report with an error
// message (or an empty report) so the page always renders.

import type { Competitor, CompetitiveAnalysisResult, CompetitiveReport, Review } from "../types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5";
const TIMEOUT_MS = 45_000;
const MAX_TOKENS = 4096;

export async function analyzeCompetitiveInsights(
  ownerReviews: Review[],
  competitors: Competitor[],
): Promise<CompetitiveAnalysisResult> {
  if (competitors.length === 0 || ownerReviews.length === 0) {
    return {
      report: emptyReport(),
      demo: false,
      error:
        competitors.length === 0
          ? "Add at least one competitor before running an analysis."
          : "The owner has no reviews to compare against yet.",
    };
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const report = await callAnthropic(key, ownerReviews, competitors);
      if (report) return { report, demo: false, error: null };
      return {
        report: demoReport(ownerReviews, competitors),
        demo: true,
        error: "AI returned an empty analysis",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { report: demoReport(ownerReviews, competitors), demo: true, error: message };
    }
  }
  return { report: demoReport(ownerReviews, competitors), demo: true, error: null };
}

function buildSystemPrompt(
  ownerReviews: Review[],
  competitors: Competitor[],
): string {
  const ownerBlock = ownerReviews
    .map((r) => `[${r.rating}★ ${r.customer}] ${r.text}`)
    .join("\n");
  const compBlock = competitors
    .map(
      (c) =>
        `--- ${c.name || c.query} ---\n` +
        c.reviews.map((r) => `[${r.rating}★ ${r.customer}] ${r.text}`).join("\n"),
    )
    .join("\n\n");
  return [
    "You are ReviewPilot, a competitive intelligence analyst for a restaurant owner.",
    "Compare the OWNER's own Google reviews against each COMPETITOR's Google reviews and produce concrete, actionable improvement recommendations.",
    "Use the present tense. Be specific and actionable, not generic. Explicitly compare each competitor's strengths to the owner's context (their current strengths and pain points visible in their reviews).",
    "Group recommendations by clear themes such as service, food, wait times, ambience, price/value.",
    "Keep every point concise (one short sentence, ~15 words max). Summarize what reviews say — do NOT copy or paste review text verbatim.",
    "",
    "=== OWNER'S REVIEWS ===",
    ownerBlock,
    "",
    "=== COMPETITORS ===",
    compBlock,
    "",
    'Respond with ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:',
    '{',
    '  "summary": "2-3 sentence overview",',
    '  "strengths": [{"name": "<competitor name>", "points": ["...", "..."]}],',
    '  "weaknesses": [{"name": "<competitor name>", "points": ["...", "..."], "sharedWithOwner": ["...", "..."]}],',
    '  "recommendations": [{"theme": "service", "items": ["...", "..."]}]',
    '}',
    "- strengths: what each competitor does well, from their positive reviews.",
    "- weaknesses: common complaints about each competitor from their negative reviews; of those, list in sharedWithOwner only the ones that also appear in the owner's own reviews.",
    "- recommendations: concrete, actionable things the owner can improve, grouped by theme and linked to what competitors do well.",
  ].join("\n");
}

async function callAnthropic(
  key: string,
  ownerReviews: Review[],
  competitors: Competitor[],
): Promise<CompetitiveReport | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(ownerReviews, competitors),
        messages: [
          { role: "user", content: "Produce the competitive intelligence report as JSON now." },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Anthropic API responded ${res.status}`);
    }
    const json = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = (json.content ?? [])
      .filter((b) => b?.type === "text" && typeof b?.text === "string")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    return parseReport(text);
  } finally {
    clearTimeout(timer);
  }
}

/** Defensively parse the AI's JSON report into a CompetitiveReport. */
function parseReport(text: string): CompetitiveReport | null {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  // Prefer the outermost {...} region, then try parsing; on truncation, fall
  // back to the longest parseable prefix so a cut-off report still yields a
  // structured (albeit partial) report instead of the full demo template.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const region = cleaned.slice(start, end + 1);
  let data: unknown;
  try {
    data = JSON.parse(region);
  } catch {
    data = longestParseablePrefix(region);
    if (data === undefined) return null;
  }
  return coerceReport(data);
}

/** Try parsing progressively shorter suffixes of a JSON string; return the
 *  longest prefix that parses, or undefined if none does. */
function longestParseablePrefix(s: string): unknown | undefined {
  let cut = s.length;
  while (cut > 4) {
    cut = s.lastIndexOf(",", cut - 1);
    const candidate = s.slice(0, Math.max(cut + 1, 1)) + "}";
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return undefined;
}

function coerceReport(data: unknown): CompetitiveReport {
  const d = (data ?? {}) as Record<string, unknown>;
  const strs = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean) : [];

  const strengths = Array.isArray(d.strengths)
    ? d.strengths
        .map((s) => {
          const o = (s ?? {}) as Record<string, unknown>;
          return { name: String(o.name ?? ""), points: strs(o.points) };
        })
        .filter((s) => s.name && s.points.length)
    : [];

  const weaknesses = Array.isArray(d.weaknesses)
    ? d.weaknesses
        .map((w) => {
          const o = (w ?? {}) as Record<string, unknown>;
          return {
            name: String(o.name ?? ""),
            points: strs(o.points),
            sharedWithOwner: strs(o.sharedWithOwner),
          };
        })
        .filter((w) => w.name && (w.points.length || w.sharedWithOwner.length))
    : [];

  const recommendations = Array.isArray(d.recommendations)
    ? d.recommendations
        .map((r) => {
          const o = (r ?? {}) as Record<string, unknown>;
          return { theme: String(o.theme ?? ""), items: strs(o.items) };
        })
        .filter((r) => r.theme && r.items.length)
    : [];

  return {
    summary: typeof d.summary === "string" && d.summary.trim() ? d.summary.trim() : "",
    strengths,
    weaknesses,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Demo report — structured templates using the real extracted review themes.
// ---------------------------------------------------------------------------

const THEMES: { key: string; label: string; keywords: string[] }[] = [
  { key: "wait", label: "Wait times", keywords: ["wait", "slow", "long", "on time", "delayed", "quick", "fast"] },
  { key: "service", label: "Service", keywords: ["service", "staff", "server", "waiter", "attentive", "rude", "ignored", "friendly", "welcome", "hospitality"] },
  { key: "food", label: "Food", keywords: ["food", "cook", "taste", "delicious", "flavor", "undercooked", "dish", "burger", "pasta", "portion"] },
  { key: "ambience", label: "Ambience", keywords: ["ambience", "atmosphere", "loud", "noisy", "romantic", "cozy", "seating", "cramped", "space", "music", "vibe"] },
  { key: "price", label: "Price / value", keywords: ["price", "pric", "expensive", "overpriced", "cost", "value", "cheap", "worth"] },
];

function themeOf(text: string): Set<string> {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const t of THEMES) {
    if (t.keywords.some((k) => lower.includes(k))) found.add(t.key);
  }
  return found;
}

function demoReport(ownerReviews: Review[], competitors: Competitor[]): CompetitiveReport {
  const ownerNeg = ownerReviews.filter((r) => r.rating <= 2);
  const ownerNegText = ownerNeg.map((r) => r.text.toLowerCase()).join(" ");

  const strengths: CompetitiveReport["strengths"] = [];
  const weaknesses: CompetitiveReport["weaknesses"] = [];

  for (const c of competitors) {
    const label = c.name || c.query;
    const pos = c.reviews.filter((r) => r.rating >= 4);
    const neg = c.reviews.filter((r) => r.rating <= 2);
    if (pos.length) {
      strengths.push({
        name: label,
        points: pos.map((r) => r.text),
      });
    }
    if (neg.length) {
      weaknesses.push({
        name: label,
        points: neg.map((r) => r.text),
        sharedWithOwner: neg
          .filter((r) => sharesWithOwner(r.text, ownerNegText))
          .map((r) => r.text),
      });
    }
  }

  // Group the owner's OWN negative themes into concrete recommendations.
  const ownerThemeCols = new Map<string, number>();
  for (const r of ownerNeg) {
    for (const t of themeOf(r.text)) {
      ownerThemeCols.set(t, (ownerThemeCols.get(t) ?? 0) + 1);
    }
  }
  const mentionCount = new Map<string, number>();
  for (const c of competitors) {
    for (const r of c.reviews.filter((x) => x.rating <= 2)) {
      for (const t of themeOf(r.text)) {
        mentionCount.set(t, (mentionCount.get(t) ?? 0) + 1);
      }
    }
  }

  const recommendations: CompetitiveReport["recommendations"] = [];
  // Themes that both the owner and their competitors struggle with are the top
  // opportunities — competitors complain too, so fixing them is differentiation.
  for (const t of THEMES) {
    const compMentions = mentionCount.get(t.key) ?? 0;
    const ownerMentions = ownerThemeCols.get(t.key) ?? 0;
    if (compMentions === 0 && ownerMentions === 0) continue;
    const items: string[] = [];
    if (ownerMentions > 0) {
      items.push(
        `Address the ${t.label.toLowerCase()} complaints in the owner's own reviews — this is the most direct lever on the owner's rating.`,
      );
    }
    if (compMentions > 0) {
      items.push(
        `Competitors ${t.label.toLowerCase()} is the biggest recurring gap among them — improving here outperforms the local market.`,
      );
    }
    recommendations.push({ theme: t.label, items });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      theme: "General",
      items: [
        "Expand competitor coverage with more reviews to surface clearer themes.",
        "Keep responding to every review — a pattern of consistent replies is itself a differentiator.",
      ],
    });
  }

  const weakMentions = [...mentionCount.values()].reduce((a, b) => a + b, 0);
  const gap = weakMentions ? "Your competitors share several of the same pain points you do — fixing them positions you clearly ahead." : "";
  const summary =
    `Across ${competitors.length} competitor(s) and ${ownerReviews.length} of the owner's own reviews, the biggest competitor strengths cluster around what they are praised for, while wait times, service and value come up as shared weaknesses. ${gap}`.trim();

  return { summary, strengths, weaknesses, recommendations };
}

function sharesWithOwner(competitorText: string, ownerNegText: string): boolean {
  const ownerSafe = ownerNegText;
  if (!ownerSafe) return false;
  const compThemes = themeOf(competitorText);
  // Any competitor complaint theme also present in the owner's negative reviews.
  for (const c of compThemes) {
    if (themeOf(ownerSafe).has(c)) return true;
  }
  return false;
}

function emptyReport(): CompetitiveReport {
  return {
    summary: "",
    strengths: [],
    weaknesses: [],
    recommendations: [],
  };
}

// ---------------------------------------------------------------------------
// Single-business "at a glance" analysis (for /analyze)
// ---------------------------------------------------------------------------

export interface OwnerInsights {
  /** One-word-ish mood label, e.g. "Happy customers" / "Mixed" / "Mostly negative". */
  mood: string;
  /** Average rating (1 decimal place). */
  rating: number;
  reviewCount: number;
  /** What-to-fix topic tags, derived from the owner's low/mid reviews. */
  whatToFix: string[];
  /** What customers praise — topic labels from positive reviews. */
  strengths: string[];
  /** What the owner should improve — concrete theme labels from negative reviews. */
  improvements: string[];
}

const MOOD_LABELS: Record<string, string> = {
  wait: "Wait times",
  service: "Service",
  food: "Food",
  ambience: "Ambience",
  price: "Price / value",
};

/**
 * Deterministic, single-business insights computed from the owner's own reviews.
 * Always available (no AI key needed): the number of pulled reviews is small
 * (≤10) and these are simple aggregates + theme counts. `demo` is driven by the
 * AI report, not by this — the /analyze page labels the whole result based on
 * whether the AI-backed report ran for real.
 */
export function analyzeOwner(reviews: Review[]): OwnerInsights {
  if (reviews.length === 0) {
    return { mood: "No reviews yet", rating: 0, reviewCount: 0, whatToFix: [], strengths: [], improvements: [] };
  }
  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  const rating = Math.round((sum / reviews.length) * 10) / 10;
  const low = reviews.filter((r) => r.rating <= 2);
  const mid = reviews.filter((r) => r.rating === 3);
  const pos = reviews.filter((r) => r.rating >= 4);

  // Mood heuristic: look at the mix of positive vs negative within the window.
  const posRatio = pos.length / reviews.length;
  const negCount = low.length + mid.length;
  let mood = "Mixed";
  if (posRatio >= 0.7 && negCount <= 1) mood = "Happy customers";
  else if (posRatio >= 0.5) mood = "Mostly positive";
  else if (negCount > pos.length) mood = "Mostly negative";

  const fixCols = new Map<string, number>();
  for (const r of low) for (const t of themeOf(r.text)) fixCols.set(t, (fixCols.get(t) ?? 0) + 1);
  for (const r of mid) for (const t of themeOf(r.text)) fixCols.set(t, (fixCols.get(t) ?? 0) + 1);

  const praiseCols = new Map<string, number>();
  for (const r of pos) for (const t of themeOf(r.text)) praiseCols.set(t, (praiseCols.get(t) ?? 0) + 1);

  const whatToFix = [...fixCols.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => MOOD_LABELS[k] ?? k)
    .filter((label, i, arr) => arr.indexOf(label) === i)
    .slice(0, 4);

  const strengths = [...praiseCols.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => MOOD_LABELS[k] ?? k)
    .filter((label, i, arr) => arr.indexOf(label) === i)
    .slice(0, 4);

  const improvements = whatToFix.length
    ? whatToFix.map((t) => `Improve ${t.toLowerCase()}`)
    : low.length
      ? ["Investigate recent negative reviews"]
      : [];

  return { mood, rating, reviewCount: reviews.length, whatToFix, strengths, improvements };
}
