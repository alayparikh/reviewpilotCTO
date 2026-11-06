// Server functions for ReviewPilot — the only place client code talks to the
// backend. All state reads/writes go through the store (Postgres when
// DATABASE_URL is set, in-memory demo otherwise).

import { createServerFn } from "@tanstack/react-start";
import type {
  AppFlags,
  AppState,
  Competitor,
  CompetitorsState,
  CompetitiveAnalysisResult,
  DraftResult,
  FetchReviewsResult,
  Review,
  Settings,
  Tone,
} from "../types";
import { TONES } from "../types";
import { generateReply } from "./ai";
import { analyzeCompetitiveInsights, analyzeOwner } from "./intel";
import { ensureAutomationLoop, runAutomationOnce } from "./automation";
import { fetchGoogleReviews, searchPlaces } from "./reviewSource";
import { getStore, isDemoMode } from "./store";

function getFlags(): AppFlags {
  return {
    demoMode: isDemoMode(),
    // Anthropic powers AI reply generation.
    aiConnected: Boolean(process.env.ANTHROPIC_API_KEY),
    // The review-data provider powers real Google review fetching.
    reviewsSourceConnected: Boolean(process.env.REVIEWS_API_KEY),
  };
}

/** Everything the dashboard needs: reviews, settings, and environment flags. */
export const getAppState = createServerFn({ method: "GET" }).handler(async () => {
  ensureAutomationLoop();
  const store = await getStore();
  const { reviews, settings } = await store.getState();
  const state: AppState = { flags: getFlags(), reviews, settings };
  return state;
});

/** Everything the review-detail page needs. */
export const getReviewDetail = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const store = await getStore();
    const [review, settings] = await Promise.all([
      store.getReview(data.id),
      store.getSettings(),
    ]);
    if (!review) {
      return { flags: getFlags(), review: null, settings };
    }
    return { flags: getFlags(), review, settings };
  });

/** Flip the master automation toggle. Turning ON runs a pass immediately. */
export const setAutomation = createServerFn({ method: "POST" })
  .validator((d: { on: boolean }) => d)
  .handler(async ({ data }) => {
    const store = await getStore();
    const settings = await store.updateSettings({ automationOn: data.on });
    let answeredNow = 0;
    if (data.on) {
      ensureAutomationLoop();
      answeredNow = await runAutomationOnce();
    }
    return { settings, answeredNow };
  });

/** Persist automation preferences (tone, which reviews to respond to, business query). */
export const updateSettings = createServerFn({ method: "POST" })
  .validator((d: { settings: Partial<Settings> }) => d)
  .handler(async ({ data }) => {
    const store = await getStore();
    const settings = await store.updateSettings(data.settings);
    return { settings };
  });

/**
 * Fetch Google reviews for the saved business query and add them
 * to the feed. Never throws: a missing key, failed call, or empty result comes
 * back as an error message the UI can show, and the app keeps working with the
 * seeded demo reviews.
 */
export const fetchReviewsNow = createServerFn({ method: "POST" }).handler(async () => {
  const store = await getStore();
  const settings = await store.getSettings();
  const query = (settings.businessQuery ?? "").trim();
  if (!query) {
    const result: FetchReviewsResult = {
      added: 0,
      error: "Set a business name or address in Settings first.",
    };
    return result;
  }
  const { reviews, error } = await fetchGoogleReviews(query);
  if (error) {
    const result: FetchReviewsResult = { added: 0, error };
    return result;
  }
  const added = await store.addReviews(reviews);
  const result: FetchReviewsResult = { added, error: null };
  return result;
});

/** Generate a reply draft for a review with the given tone (AI or demo). */
export const getReplyDraft = createServerFn({ method: "POST" })
  .validator((d: { id: string; tone: Tone }) => d)
  .handler(async ({ data }) => {
    const store = await getStore();
    const review = await store.getReview(data.id);
    if (!review) {
      throw new Error("Review not found");
    }
    const tone: Tone = TONES.includes(data.tone) ? data.tone : "Friendly";
    const { text, demo, error } = await generateReply(review, tone);
    const result: DraftResult = { text, demo, error, tone };
    return result;
  });

/**
 * Manual "Generate reply" (used when automation is OFF). Generates the reply
 * and marks the review answered — this stores a draft reply. Nothing is ever
 * posted to Google: posting arrives in a later phase, and the UI says so.
 */
export const saveReply = createServerFn({ method: "POST" })
  .validator((d: { id: string; tone: Tone }) => d)
  .handler(async ({ data }) => {
    const store = await getStore();
    const review = await store.getReview(data.id);
    if (!review) {
      throw new Error("Review not found");
    }
    const tone: Tone = TONES.includes(data.tone) ? data.tone : "Friendly";
    const { text, demo } = await generateReply(review, tone);
    const updated = await store.markAnswered(review.id, text, tone, demo);
    return { review: updated as Review };
  });

// ---------------------------------------------------------------------------
// Competitive Review Intelligence
// ---------------------------------------------------------------------------

export interface FetchCompetitorResult {
  competitor: Competitor | null;
  added: boolean;
  error: string | null;
}

export interface AnalyzeCompetitorsResult extends CompetitiveAnalysisResult {
  flags: AppFlags;
}

/** Everything the /competitors page needs: flags, competitor list, owner reviews. */
export const getCompetitors = createServerFn({ method: "GET" }).handler(async () => {
  const store = await getStore();
  const [competitors, ownerReviews] = await Promise.all([
    store.listCompetitors(),
    store.getOwnerReviews(),
  ]);
  const state: CompetitorsState = { flags: getFlags(), competitors, ownerReviews };
  return state;
});

/**
 * Fetch Google reviews for a competitor query and persist the
 * competitor + its reviews. Never throws: a missing key, failed call, or empty
 * result comes back as an error message the UI can show.
 */
export const fetchCompetitor = createServerFn({ method: "POST" })
  .validator((d: { query: string }) => d)
  .handler(async ({ data }): Promise<FetchCompetitorResult> => {
    const query = (data.query ?? "").trim();
    if (!query) {
      return { competitor: null, added: false, error: "Enter a competitor business name or address." };
    }
    const { reviews, error } = await fetchGoogleReviews(query);
    if (error) {
      return { competitor: null, added: false, error };
    }
    const store = await getStore();
    const existing = await store.listCompetitors();
    const competitor = await store.addCompetitor(query, reviews);
    const added = !existing.some((c) => c.id === competitor.id);
    return { competitor, added, error: null };
  });

/**
 * Compare the owner's own reviews against the selected (or all) competitors'
 * reviews and produce structured competitive insights. Never throws: no AI key
 * (or a failed call) returns a clearly-labeled demo report.
 */
export const analyzeCompetitors = createServerFn({ method: "POST" })
  .validator((d: { competitorIds?: string[] }) => d)
  .handler(async ({ data }): Promise<AnalyzeCompetitorsResult> => {
    const store = await getStore();
    const [allCompetitors, ownerReviews] = await Promise.all([
      store.listCompetitors(),
      store.getOwnerReviews(),
    ]);
    const ids = new Set(data.competitorIds ?? []);
    const selected = ids.size > 0 ? allCompetitors.filter((c) => ids.has(c.id)) : allCompetitors;
    const { report, demo, error } = await analyzeCompetitiveInsights(ownerReviews, selected);
    return { report, demo, error, flags: getFlags() };
  });

// ---------------------------------------------------------------------------
// /analyze — mirror of the ReviewIQ flow
// ---------------------------------------------------------------------------

/** One resolved place (already disambiguated) to analyze. */
export interface AnalyzePlaceInput {
  /** Combined query used to fetch this place's reviews (name + address/hint). */
  query: string;
  /** Display name for the place. */
  label: string;
  /** Provider place_id, when known. */
  placeId?: string;
  /** Place's overall Google rating, when known. */
  googleRating?: number;
}

export interface AnalyzeRequest {
  business: AnalyzePlaceInput;
  competitor?: AnalyzePlaceInput;
  tone: Tone;
}

export interface AnalyzeReply {
  reviewId: string;
  customer: string;
  text: string;
  tone: Tone;
  demo: boolean;
}

export interface AnalyzeBusinessStats {
  name: string;
  rating: number;
  reviewCount: number;
  demo: boolean;
}

export interface AnalyzeResult {
  flags: AppFlags;
  /** True when the competitive report fell back to a demo template (no/failed AI). */
  demo: boolean;
  error: string | null;
  tone: Tone;
  business: {
    label: string;
    mood: string;
    googleRating: number;
    reviewCount: number;
    whatToFix: string[];
    strengths: string[];
    improvements: string[];
    reviews: Review[];
  };
  competitor?: {
    label: string;
    stats: AnalyzeBusinessStats;
    strengths: string[];
    improvements: string[];
    reviews: Review[];
  };
  report: CompetitiveAnalysisResult["report"];
  suggestions: CompetitiveAnalysisResult["report"]["recommendations"];
  replies: AnalyzeReply[];
}

export interface SearchPlacesResult {
  places: Array<{ id?: string; name: string; fullAddress?: string; rating?: number; reviewsCount?: number; query: string }>;
  error: string | null;
}

/** Search candidate Google places for a business (+ optional location hint). */
export const searchPlacesQuery = createServerFn({ method: "POST" })
  .validator((d: { query: string; locationHint?: string }) => d)
  .handler(async ({ data }): Promise<SearchPlacesResult> => {
    const query = (data.query ?? "").trim();
    if (!query) {
      return { places: [], error: "Enter a business name or address first." };
    }
    const { places, error } = await searchPlaces(query, data.locationHint);
    return { places, error };
  });

/**
 * The full /analyze flow: fetch the owner's real Google reviews (and an optional
 * competitor's), persist them (which clears demo placeholders once real data
 * exists), run the competitive + per-review reply analysis, and return a single
 * structured result. Never throws: a missing/failed provider degrades to a
 * clearly-labeled demo result.
 */
export const analyzeBusiness = createServerFn({ method: "POST" })
  .validator((d: AnalyzeRequest) => d)
  .handler(async ({ data }): Promise<AnalyzeResult> => {
    const store = await getStore();
    const tone: Tone = TONES.includes(data.tone) ? data.tone : "Friendly";
    const err = (message: string): AnalyzeResult => ({
      flags: getFlags(),
      demo: false,
      error: message,
      tone,
      business: {
        label: data.business?.label ?? "",
        mood: "",
        googleRating: 0,
        reviewCount: 0,
        whatToFix: [],
        strengths: [],
        improvements: [],
        reviews: [],
      },
      report: { summary: "", strengths: [], weaknesses: [], recommendations: [] },
      suggestions: [],
      replies: [],
    });

    // 1) Owner's real reviews (source: "google").
    const ownerFetch = await fetchGoogleReviews(data.business.query, {
      placeId: data.business.placeId,
    });
    if (ownerFetch.error) return err(`Couldn't fetch reviews for "${data.business.label}": ${ownerFetch.error}`);
    if (ownerFetch.reviews.length === 0) return err(`No reviews found for "${data.business.label}".`);

    // 2) Persist owner reviews — real data triggers demo-seed clearing.
    await store.addReviews(ownerFetch.reviews);
    const allOwner = await store.getOwnerReviews();

    // 3) Optional competitor.
    let competitor = undefined as AnalyzeResult["competitor"];
    if (data.competitor?.query) {
      const compFetch = await fetchGoogleReviews(data.competitor.query, {
        placeId: data.competitor.placeId,
      });
      if (compFetch.error) {
        return err(`Couldn't fetch competitor reviews for "${data.competitor.label}": ${compFetch.error}`);
      }
      if (compFetch.reviews.length === 0) {
        return err(`No reviews found for competitor "${data.competitor.label}".`);
      }
      await store.addCompetitor(data.competitor.query, compFetch.reviews, data.competitor.label);
      const stored = await store.listCompetitors();
      const storedComp = stored.find(
        (c) => c.id === ("comp-" + hashCompetitorQuery(data.competitor!.query)),
      ) ?? stored.find((c) => c.query === data.competitor!.query);
      const stats: AnalyzeBusinessStats = {
        name: storedComp?.name ?? data.competitor.label,
        rating: avgRating(compFetch.reviews),
        reviewCount: compFetch.reviews.length,
        demo: false,
      };
      const insight = analyzeOwner(compFetch.reviews);
      competitor = {
        label: stats.name,
        stats,
        strengths: insight.strengths,
        improvements: insight.improvements,
        reviews: compFetch.reviews,
      };
    }

    // 4) At-a-glance info from the owner's real reviews (deterministic).
    const glance = analyzeOwner(allOwner);

    // 5) Competitive report: one AI call when an AI key exists, else demo template.
    const own = allOwner.length ? allOwner : ownerFetch.reviews;
    const compRes = await analyzeCompetitiveInsights(
      own,
      (await store.listCompetitors()).filter((c) => !c.demo),
    );
    const report = compRes.report;
    const demo = compRes.demo;
    const error = compRes.error;

    // Suggestions = prioritized, theme-grouped recommendations from the report,
    // but without a competitor we fall back to the owner's own themed fixes.
    const suggestions =
      report.recommendations.length > 0
        ? report.recommendations
        : glance.improvements.map((im) => ({ theme: "Your business", items: [im] }));

    // 6) Per-review suggested AI replies for the owner's own reviews.
    const replies: AnalyzeReply[] = [];
    for (const r of own.slice(0, 10)) {
      const { text, demo: replyDemo } = await generateReply(r, tone);
      replies.push({ reviewId: r.id, customer: r.customer, text, tone, demo: replyDemo });
    }

    return {
      flags: getFlags(),
      demo,
      error,
      tone,
      business: {
        label: data.business.label,
        mood: glance.mood,
        googleRating: data.business.googleRating ?? glance.rating,
        reviewCount: glance.reviewCount,
        whatToFix: glance.whatToFix,
        strengths: glance.strengths,
        improvements: glance.improvements,
        reviews: own,
      },
      competitor,
      report,
      suggestions,
      replies,
    };
  });

function avgRating(reviews: Review[]): number {
  if (reviews.length === 0) return 0;
  return Math.round((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length) * 10) / 10;
}

/** Deterministic id for a competitor query — mirrors store.ts's competitorId. */
function hashCompetitorQuery(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}
