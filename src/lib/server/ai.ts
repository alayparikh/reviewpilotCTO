import type { Review, Tone } from "../types";

export interface GeneratedReply {
  text: string;
  /** True when `text` is a local demo template, not a real AI-generated reply. */
  demo: boolean;
  /** Set when the AI call failed and we fell back to a demo template. */
  error: string | null;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// Verified current model id against Anthropic's docs
// (https://docs.anthropic.com/en/docs/about-claude/models/overview) and tested
// live against the Messages API.
const ANTHROPIC_MODEL = "claude-haiku-4-5";
const TIMEOUT_MS = 20_000;

function toneInstruction(tone: Tone): string {
  switch (tone) {
    case "Friendly":
      return "casual, warm, and approachable";
    case "Professional":
      return "polished, courteous, and businesslike";
    case "Warm":
      return "genuinely caring, personal, and heartfelt";
  }
}

function buildSystemPrompt(review: Review, tone: Tone): string {
  const sentiment =
    review.rating <= 2
      ? "The customer was unhappy: apologize sincerely and invite them back or offer to make it right."
      : review.rating === 3
        ? "The customer was mixed: thank them and acknowledge the specific feedback."
        : "The customer was happy: thank them warmly and reference what they praised.";
  return [
    "You are ReviewPilot, an AI assistant that writes review replies for a restaurant owner.",
    `Write a reply to a customer's Google review in a ${toneInstruction(tone)} tone.`,
    "Sign the reply as the restaurant. Do NOT claim any specific fix was made unless the review mentions it was offered.",
    "Keep it to 2-4 sentences, never mention you are an AI, and address the customer's specific points.",
    `The review is rated ${review.rating} out of 5 stars. ${sentiment}`,
    "This reply is a draft for the owner's review dashboard — do NOT claim the reply has been posted to Google or anywhere else.",
  ].join(" ");
}

/**
 * Generate a reply for a review.
 * - If ANTHROPIC_API_KEY is present, call the Anthropic Messages API.
 * - Otherwise (or on failure) return a clearly-labeled demo template reply.
 * Demo replies are flagged with `demo: true` so the UI can label them — a demo
 * reply is never presented as a real AI-generated one.
 */
export async function generateReply(review: Review, tone: Tone): Promise<GeneratedReply> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const text = await callAnthropic(key, review, tone);
      if (text) return { text, demo: false, error: null };
      return { text: demoReply(review, tone), demo: true, error: "AI returned an empty reply" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { text: demoReply(review, tone), demo: true, error: message };
    }
  }
  return { text: demoReply(review, tone), demo: true, error: null };
}

async function callAnthropic(key: string, review: Review, tone: Tone): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const user = `Customer name: ${review.customer}\nReview: "${review.text}"\n\nWrite the reply now.`;
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 500,
        system: buildSystemPrompt(review, tone),
        messages: [{ role: "user", content: user }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Anthropic API responded ${res.status}`);
    }
    const json = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    // Defensive parse: content is normally an array of typed blocks; join any
    // text blocks so a slightly different shape still yields the reply.
    const text = (json.content ?? [])
      .filter((b) => b?.type === "text" && typeof b?.text === "string")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    return text;
  } finally {
    clearTimeout(timer);
  }
}

const KNOWN_ITEMS = [
  "short rib",
  "clam chowder",
  "risotto",
  "linguine",
  "chicken sandwich",
  "avocado toast",
  "pork chop",
  "burrata",
  "pasta",
  "salad",
  "tiramisu",
  "coffee",
  "fries",
  "wine",
];

function firstMentionedItem(text: string): string | null {
  const lower = text.toLowerCase();
  for (const item of KNOWN_ITEMS) {
    if (lower.includes(item)) return item;
  }
  return null;
}

/**
 * Demo reply templates — deterministic, clearly local, keyed by sentiment and
 * tone. Only used when no AI provider is connected (or the AI call failed).
 */
export function demoReply(review: Review, tone: Tone): string {
  const firstName = review.customer.split(" ")[0] ?? review.customer;
  const item = firstMentionedItem(review.text);
  const itemPhrase = item ? ` the ${item}` : " your meal";
  const itemThanks = item
    ? `so glad the ${item} hit the spot`
    : "so glad everything hit the spot";

  if (review.rating >= 4) {
    if (tone === "Professional") {
      return `Dear ${firstName}, thank you for your review. We're delighted that${itemPhrase} exceeded expectations, and we appreciate you taking the time to share your feedback. We hope to welcome you back soon.`;
    }
    if (tone === "Warm") {
      return `Thank you, ${firstName} — that truly means the world to us. We're ${itemThanks}, and we'll make sure the same care and warmth are waiting for you next time. See you soon!`;
    }
    return `Hi ${firstName}, thank you so much for the kind words! We're ${itemThanks} and we can't wait to host you again — come hungry!`;
  }

  if (review.rating <= 2) {
    if (tone === "Professional") {
      return `Dear ${firstName}, thank you for bringing this to our attention. We're sorry your experience fell short of the standard we aim for, and we take your feedback seriously. Please reach out to us directly so we can make it right — we'd love the chance to restore your confidence.`;
    }
    if (tone === "Warm") {
      return `${firstName}, we're truly sorry — this isn't the experience we want any guest to have, and we're grateful you told us. We've shared your feedback with the team and we'd love to make it right. Please reach out so we can take care of you personally.`;
    }
    return `Hi ${firstName}, we're really sorry about this — that's not the experience we want you to have, and thank you for being honest with us. We'd love to make it right; please reach out to us directly and we'll take care of you.`;
  }

  // Neutral (3★)
  if (tone === "Professional") {
    return `Dear ${firstName}, thank you for your balanced feedback. We're glad you enjoyed${itemPhrase} and we take your notes about the service seriously — we're always working to improve. We hope you'll give us another try.`;
  }
  if (tone === "Warm") {
    return `${firstName}, thank you for taking the time to share your honest thoughts. We're glad${item ? ` the ${item}` : " your meal"} stood out, and we're sorry the rest didn't fully hit the mark. We'd love to show you a five-star experience next time.`;
  }
  return `Hi ${firstName}, thanks for the honest feedback — it really helps us get better. Glad you enjoyed${itemPhrase}, and we're sorry the service fell short. We'd love another chance to win you over!`;
}
