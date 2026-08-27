// Shared helper for sorting reviews newest-first at read time.
//
// The store layer is the single source of truth for feed ordering: every read
// (getState, listReviews) returns reviews sorted by date descending, so the
// dashboard feed is correct regardless of insertion order (seed array order,
// Outscraper fetch order, or automation-driven updates). Outscraper also uses
// this defensively after mapping a raw API response.
//
// `date` is an ISO string; sorting uses Date.parse so unparseable dates fall
// back to 0 (oldest). A stable tiebreak on id keeps ordering deterministic so
// the feed never flickers between identical timestamps.

import type { Review } from "./types";

export function sortReviewsNewestFirst(reviews: Review[]): Review[] {
  return [...reviews].sort((a, b) => {
    const da = Date.parse(a.date) || 0;
    const db = Date.parse(b.date) || 0;
    if (db !== da) return db - da; // descending: newest first
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // stable tiebreak
  });
}
