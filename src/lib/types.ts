// Shared types for ReviewPilot. Safe to import from client or server code.

export type ReviewStatus = "new" | "answered";

export type Tone = "Friendly" | "Professional" | "Warm";

export const TONES: Tone[] = ["Friendly", "Professional", "Warm"];

/** Which reviews the automation engine is allowed to auto-respond to. */
export type RespondTo = "all" | "positive" | "negative";

/** Where a review came from: seeded sample data, or fetched from Google. */
export type ReviewSource = "demo" | "google";

export interface Review {
  id: string;
  customer: string;
  rating: number; // 1-5 stars
  text: string;
  date: string; // ISO timestamp
  status: ReviewStatus;
  /** Drafted reply text, when answered. */
  reply?: string | null;
  /** When the reply was drafted. */
  repliedAt?: string | null;
  replyTone?: Tone | null;
  /** True when the reply is a demo template, not a real AI-generated one. */
  replyDemo?: boolean;
  /** demo = seeded sample data; google = fetched from Google. */
  source?: ReviewSource;
}

export interface Settings {
  /** Master automation toggle. */
  automationOn: boolean;
  defaultTone: Tone;
  /** all = every review; positive = only 4-5★; negative = only 1-3★. */
  respondTo: RespondTo;
  /** When false, 1-2★ reviews are held for manual review. */
  autoRespondLowStars: boolean;
  /** Business name or address used to fetch Google reviews. */
  businessQuery: string;
}

export interface AppFlags {
  /** True when DATABASE_URL is missing — data lives in memory and is sample data. */
  demoMode: boolean;
  /** True when ANTHROPIC_API_KEY is present — real AI replies are possible. */
  aiConnected: boolean;
  /** True when REVIEWS_API_KEY is present — real Google review fetching is possible. */
  reviewsSourceConnected: boolean;
}

export interface AppState {
  flags: AppFlags;
  reviews: Review[];
  settings: Settings;
}

export interface DraftResult {
  text: string;
  demo: boolean;
  error: string | null;
  tone: Tone;
}

export interface FetchReviewsResult {
  added: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Competitive Review Intelligence
// ---------------------------------------------------------------------------

/**
 * A competitor whose Google reviews have been fetched for comparison. Reviews
 * may be real (fetched live, source "google") or seeded sample
 * data (flagged `demo: true`) so they are never mistaken for real data.
 */
export interface Competitor {
  id: string;
  /** The business name or address query used to fetch these reviews. */
  query: string;
  /** Resolved business name when known (optional). */
  name?: string | null;
  reviews: Review[];
  /** ISO timestamp of when reviews were fetched. */
  fetchedAt: string;
  /** True when reviews are seeded demo data, not fetched live. */
  demo?: boolean;
}

/** What a single competitor does well, drawn from their positive reviews. */
export interface CompetitorStrength {
  name: string;
  points: string[];
}

/** Weaknesses a competitor's customers complain about, and whether the owner shares them. */
export interface CompetitorWeakness {
  name: string;
  points: string[];
  /** Subset of `points` that also show up in the owner's own reviews. */
  sharedWithOwner: string[];
}

/** An actionable recommendation, grouped by theme (service, food, wait, ambience…). */
export interface RecommendationGroup {
  theme: string;
  items: string[];
}

/** Structured competitive-analysis report. */
export interface CompetitiveReport {
  summary: string;
  strengths: CompetitorStrength[];
  weaknesses: CompetitorWeakness[];
  recommendations: RecommendationGroup[];
}

export interface CompetitiveAnalysisResult {
  report: CompetitiveReport;
  /** True when the report is a local demo template, not real AI-generated insights. */
  demo: boolean;
  error: string | null;
}

export interface CompetitorsState {
  flags: AppFlags;
  competitors: Competitor[];
  /** The owner's own reviews (all non-competitor reviews in the store). */
  ownerReviews: Review[];
}

export const DEFAULT_SETTINGS: Settings = {
  automationOn: false,
  defaultTone: "Friendly",
  respondTo: "all",
  autoRespondLowStars: true,
  businessQuery: "",
};

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Relative-ish label for the feed (e.g. "2h ago", "3d ago"). */
export function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return iso;
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}
