// Server-only module for fetching Google reviews via the Outscraper API.
//
// Endpoint verified against Outscraper's public docs and SDK source:
//   - SDK (github.com/outscraper/outscraper-python): outscraper/transport.py
//     lists base URLs https://api.app.outscraper.com and
//     https://api.app.outscraper.cloud and the X-API-KEY header;
//     outscraper/client.py's google_maps_reviews() calls GET /maps/reviews-v3
//     with params query / reviewsLimit / limit / sort / language (doc:
//     https://app.outscraper.com/api-docs#tag/Google/paths/~1maps~1reviews-v3/get).
//   - Live testing (2026-08-11) with the team key: api.app.outscraper.com
//     rejects the key (401), while api.outscraper.cloud accepts it and returns
//     HTTP 202 { status: "Pending", results_location } which is polled until
//     { status: "Success", data: [place...] }. Place reviews live under
//     reviews_data[] with review_text / review_rating / author_title /
//     review_timestamp (unix seconds).
//
// Everything here is defensive: a missing key, a bad response, or a changed
// response shape degrades to an error message instead of crashing. The app
// keeps working with seeded demo reviews in all of those cases.

import type { Review } from "../types";
import { sortReviewsNewestFirst } from "../reviewSort";

const OUTSCRAPER_HOSTS = [
  "https://api.app.outscraper.com",
  "https://api.outscraper.cloud",
];
const REVIEWS_PATH = "/maps/reviews-v3";
const SEARCH_PATH = "/maps/search-v3";
const REQUEST_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 2_000;
const TOTAL_TIMEOUT_MS = 45_000;

export interface FetchGoogleReviewsResult {
  reviews: Review[];
  error: string | null;
}

/** A place that matched a search — used for disambiguation ("which location?"). */
export interface PlaceCandidate {
  /** Outscraper place_id, when present. */
  id?: string;
  name: string;
  /** Human-readable address (city, state…). */
  fullAddress?: string;
  /** Place's overall Google rating (0-5). */
  rating?: number;
  /** Rough review count on the place listing. */
  reviewsCount?: number;
  /** Combined query (name + location hint) used to fetch this place's reviews. */
  query: string;
}

/**
 * Search for candidate Google places matching a business name (+ optional city
 * or ZIP hint). Used for the disambiguation step in /analyze — when more than
 * one listing matches, the user picks the right one before we fetch reviews.
 */
export async function searchPlaces(
  query: string,
  locationHint?: string,
): Promise<{ places: PlaceCandidate[]; error: string | null }> {
  const key = process.env.OUTSCRAPER_API_KEY;
  if (!key) {
    return {
      places: [],
      error: "OUTSCRAPER_API_KEY is not set — add it to find businesses.",
    };
  }
  const combined = joinQuery(query, locationHint);
  const params = new URLSearchParams({
    query: combined,
    limit: "5",
    language: "en",
  });

  let lastError: string | null = null;
  for (const host of OUTSCRAPER_HOSTS) {
    try {
      const json = await getJson(`${host}${SEARCH_PATH}?${params.toString()}`, key);
      // search-v3 is an async job too (returns { status:"Pending", results_location }).
      if (
        json &&
        typeof json === "object" &&
        typeof (json as { results_location?: unknown }).results_location === "string"
      ) {
        const loc = (json as { results_location: string }).results_location;
        const job = await pollJob(loc, key);
        const places = parsePlaces(job, query);
        if (places.length > 0) return { places, error: null };
        lastError = "Outscraper found no matching places for that query.";
      } else {
        const places = parsePlaces(json, query);
        if (places.length > 0) return { places, error: null };
        lastError = "Outscraper found no matching places for that query.";
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { places: [], error: lastError ?? "Outscraper search failed" };
}

/**
 * Poll an Outscraper async job (results_location) until it succeeds, fails, or
 * times out. Returns the decoded job payload (usually { status, data }) or null.
 */
async function pollJob(loc: string, key: string): Promise<unknown> {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  for (;;) {
    const job = await getJson(loc, key);
    const status = (job as { status?: string } | null)?.status;
    if (status === "Success") return job;
    if (status === "Failed" || status === "Error") return null;
    if (Date.now() > deadline) return null;
    await sleep(POLL_INTERVAL_MS);
  }
}

/** Combine a business name with an optional location hint for the outscraper query. */
export function joinQuery(name: string, locationHint?: string): string {
  const hint = (locationHint ?? "").trim();
  const n = name.trim();
  if (!hint) return n;
  return `${n}, ${hint}`;
}

/** Defensively walk a search-v3 response into PlaceCandidate[] (array or {data:[...]}). */
function parsePlaces(json: unknown, originalQuery: string): PlaceCandidate[] {
  let items: unknown[] = Array.isArray(json)
    ? json
    : Array.isArray((json as { data?: unknown })?.data)
      ? ((json as { data: unknown[] }).data)
      : [];
  // The API has been observed returning a nested [[place, place]] shape in
  // addition to the flat [place, place]; flatten one level so both parse.
  if (items.length === 1 && Array.isArray(items[0])) {
    items = items[0] as unknown[];
  }
  const places: PlaceCandidate[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const p = (it ?? {}) as Record<string, unknown>;
    const name = typeof p.name === "string" && p.name.trim() ? p.name.trim() : "";
    if (!name) continue;
    const id = typeof p.place_id === "string" ? p.place_id : "";
    const key = id || `${name}|${String(p.address ?? p.full_address ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fullAddress =
      (typeof p.full_address === "string" ? p.full_address : "") ||
      (typeof p.address === "string" ? p.address : "");
    places.push({
      id: id || undefined,
      name,
      fullAddress: fullAddress || undefined,
      rating: Number.isFinite(Number(p.rating)) ? Number(p.rating) : undefined,
      reviewsCount: Number.isFinite(Number(p.reviews)) ? Number(p.reviews) : undefined,
      // Reviews are fetched using name + the place's own address when available
      // (most precise), otherwise the place's address, otherwise the original query.
      query: fullAddress ? `${name}, ${fullAddress}` : originalQuery,
    });
  }
  return places;
}

/** Fetch up to 10 Google reviews for a business name or address query. */
export async function fetchGoogleReviews(
  query: string,
  opts?: { placeId?: string },
): Promise<FetchGoogleReviewsResult> {
  const key = process.env.OUTSCRAPER_API_KEY;
  if (!key) {
    return {
      reviews: [],
      error: "OUTSCRAPER_API_KEY is not set — add it in Settings to fetch real reviews.",
    };
  }
  const params = new URLSearchParams({
    query,
    reviewsLimit: "10",
    limit: "1",
    sort: "newest",
    language: "en",
    ignoreEmpty: "true",
  });
  if (opts?.placeId) params.set("place_id", opts.placeId);

  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  let lastError: string | null = null;

  for (const host of OUTSCRAPER_HOSTS) {
    try {
      const result = await fetchOnce(`${host}${REVIEWS_PATH}?${params.toString()}`, key);
      if (result.reviews.length > 0) return result; // got real reviews
      lastError = result.error;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (Date.now() > deadline) break;
  }

  return { reviews: [], error: lastError ?? "Outscraper fetch failed" };
}

async function fetchOnce(url: string, key: string): Promise<FetchGoogleReviewsResult> {
  const initial = await getJson(url, key);
  // Async job shape (api.outscraper.cloud): HTTP 202 → { status, id, results_location }.
  if (
    initial &&
    typeof initial === "object" &&
    typeof (initial as { results_location?: unknown }).results_location === "string"
  ) {
    const loc = (initial as { results_location: string }).results_location;
    const deadline = Date.now() + TOTAL_TIMEOUT_MS;
    for (;;) {
      const job = await getJson(loc, key);
      const status = (job as { status?: string } | null)?.status;
      if (status === "Success") {
        const reviews = parseReviews((job as { data?: unknown }).data);
        return reviews.length > 0
          ? { reviews, error: null }
          : { reviews: [], error: "Outscraper returned no reviews for that query." };
      }
      if (status === "Failed" || status === "Error") {
        return { reviews: [], error: "Outscraper job failed." };
      }
      if (Date.now() > deadline) {
        return { reviews: [], error: "Outscraper job timed out." };
      }
      await sleep(POLL_INTERVAL_MS);
    }
  }
  // Synchronous shape: array of places, or { data: [...] }.
  const reviews = parseReviews(initial);
  if (reviews.length > 0) return { reviews, error: null };
  return { reviews: [], error: "Outscraper returned no reviews for that query." };
}

async function getJson(url: string, key: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "X-API-KEY": key },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Outscraper API responded ${res.status} (${res.statusText})`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Defensively walk the response: array of places or {data: [...]}. */
function parseReviews(json: unknown): Review[] {
  const places: unknown[] = Array.isArray(json)
    ? json
    : Array.isArray((json as { data?: unknown })?.data)
      ? ((json as { data: unknown[] }).data)
      : [];
  const out: Review[] = [];
  const seen = new Set<string>();
  for (const place of places) {
    const reviewsData = Array.isArray((place as { reviews_data?: unknown })?.reviews_data)
      ? ((place as { reviews_data: unknown[] }).reviews_data)
      : [];
    for (const r of reviewsData) {
      const rec = (r ?? {}) as Record<string, unknown>;
      const text = typeof rec.review_text === "string" ? rec.review_text.trim() : "";
      if (!text) continue;
      const customer = pickName(rec);
      const rating = clampRating(Number(rec.review_rating));
      const date = reviewDate(rec);
      const id = "os-" + hash(`${customer}|${rating}|${text}`);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, customer, rating, text, date, status: "new", source: "google" });
    }
  }
  // Defensive: the API is asked for sort:"newest", but don't trust insertion
  // order — return reviews newest-first regardless of response ordering.
  return sortReviewsNewestFirst(out);
}

function pickName(rec: Record<string, unknown>): string {
  for (const field of ["author_title", "reviewer_name"]) {
    const v = rec[field];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "Anonymous";
}

function clampRating(n: number): number {
  if (Number.isFinite(n) && n >= 1 && n <= 5) return Math.round(n);
  return 5; // fall back to a neutral-positive rating rather than crash
}

function reviewDate(rec: Record<string, unknown>): string {
  // Unix seconds timestamp is the most reliable field.
  const ts = Number(rec.review_timestamp);
  if (Number.isFinite(ts) && ts > 0) return new Date(ts * 1000).toISOString();
  const iso = rec.review_datetime_utc;
  if (typeof iso === "string" && iso.trim()) {
    const parsed = parseLegacyDate(iso.trim());
    if (parsed) return parsed;
  }
  return new Date().toISOString();
}

/** Parse Outscraper's "MM/DD/YYYY HH:MM:SS" datetime (and plain ISO). */
function parseLegacyDate(value: string): string | null {
  const iso = new Date(value);
  if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, month, day, year, hour, min, sec] = m;
    const d = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min), Number(sec ?? 0)),
    );
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

/** Small deterministic hash so re-fetching the same review yields the same id. */
function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}
