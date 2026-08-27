// Server-only automation engine.
//
// A setInterval loop (started lazily on first server-function use) picks up New
// reviews, generates a reply (real AI or demo — same logic as the manual flow),
// and marks them Answered (draft). When the master toggle is OFF the loop
// no-ops, so reviews stay New until manually approved.
//
// Note: "answered" here means a draft reply has been generated and stored.
// Posting replies to Google is deferred to a later phase — nothing is ever
// posted by this loop, and the UI labels answered reviews accordingly.

import type { Review, Settings } from "../types";
import { generateReply } from "./ai";
import { getStore } from "./store";

const LOOP_INTERVAL_MS = 30_000;

let loopStarted = false;
let loopRunning = false;

/** Start the automation loop (idempotent). Called from server functions. */
export function ensureAutomationLoop(): void {
  if (loopStarted) return;
  loopStarted = true;
  const interval = setInterval(() => {
    runAutomationOnce().catch((err) => {
      console.error("[reviewpilot] automation loop error:", err);
    });
  }, LOOP_INTERVAL_MS);
  // Don't keep the process alive just for the timer when idle.
  if (typeof interval.unref === "function") interval.unref();
  console.log("[reviewpilot] automation loop started (every 30s)");
}

/** Does this review qualify for auto-respond given the current settings? */
export function qualifiesForAutoReply(r: Review, s: Settings): boolean {
  if (!s.autoRespondLowStars && r.rating <= 2) return false;
  if (s.respondTo === "positive" && r.rating < 4) return false;
  if (s.respondTo === "negative" && r.rating > 3) return false;
  return true;
}

/**
 * One pass of the automation engine. Returns how many reviews were answered
 * (drafted). No-ops when automation is OFF. Never throws to the caller —
 * errors are caught per review.
 */
export async function runAutomationOnce(): Promise<number> {
  const store = await getStore();
  const settings = await store.getSettings();
  if (!settings.automationOn) return 0;
  if (loopRunning) return 0;
  loopRunning = true;
  try {
    const reviews = await store.listReviews();
    const candidates = reviews.filter(
      (r) => r.status === "new" && qualifiesForAutoReply(r, settings),
    );
    let answered = 0;
    for (const review of candidates) {
      try {
        const { text, demo } = await generateReply(review, settings.defaultTone);
        await store.markAnswered(review.id, text, settings.defaultTone, demo);
        answered++;
      } catch (err) {
        console.error(`[reviewpilot] automation failed for ${review.id}:`, err);
      }
    }
    return answered;
  } finally {
    loopRunning = false;
  }
}
