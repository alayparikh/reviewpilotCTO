// Server-only storage layer for ReviewPilot.
//
// Two backends behind one interface:
//  - Postgres (Neon) when process.env.DATABASE_URL is present — tables are
//    created on first use and seeded with sample reviews.
//  - In-memory when DATABASE_URL is missing — the full demo flow still works,
//    data resets on server restart. The UI is told via flags.demoMode so it can
//    label everything as demo data.
//
// Nothing here is ever imported by client components — only by server functions.

import { sql } from "~/db";
import type { Competitor, Review, Settings, Tone } from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { SEED_COMPETITORS, SEED_REVIEWS } from "../seed";
import { sortReviewsNewestFirst } from "../reviewSort";

export interface Store {
  getState(): Promise<{ reviews: Review[]; settings: Settings }>;
  getSettings(): Promise<Settings>;
  listReviews(): Promise<Review[]>;
  getReview(id: string): Promise<Review | null>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  /** Add externally-fetched reviews, skipping duplicates. Returns count added. */
  addReviews(reviews: Review[]): Promise<number>;
  /** Mark a review answered with the drafted reply. Returns the updated review. */
  markAnswered(
    id: string,
    reply: string,
    tone: Tone,
    demo: boolean,
  ): Promise<Review | null>;
  // --- Competitive Review Intelligence ---
  /** All competitors with their fetched reviews. */
  listCompetitors(): Promise<Competitor[]>;
  /** Add (or update if the query already exists) a competitor with its reviews. */
  addCompetitor(query: string, reviews: Review[], name?: string | null): Promise<Competitor>;
  /** The owner's own reviews — all reviews that are not competitor reviews. */
  getOwnerReviews(): Promise<Review[]>;
}

// ---------------------------------------------------------------------------
// In-memory backend (demo mode — no DATABASE_URL)
// ---------------------------------------------------------------------------

interface MemDb {
  reviews: Review[];
  settings: Settings;
  competitors: Competitor[];
}

const mem: MemDb = {
  reviews: [],
  settings: { ...DEFAULT_SETTINGS },
  competitors: [],
};

function ensureMemSeeded(): void {
  if (mem.reviews.length === 0) {
    mem.reviews = SEED_REVIEWS.map((r) => ({ ...r }));
  }
  if (mem.competitors.length === 0) {
    mem.competitors = SEED_COMPETITORS.map((c) => ({
      ...c,
      reviews: c.reviews.map((r) => ({ ...r })),
    }));
  }
}

/** Small deterministic id for a competitor query (same query → same id). */
function competitorId(query: string): string {
  const h = hashQuery(query);
  return "comp-" + h;
}

function hashQuery(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

function createMemoryStore(): Store {
  return {
    async getState() {
      ensureMemSeeded();
      return {
        reviews: sortReviewsNewestFirst(mem.reviews.map((r) => ({ ...r }))),
        settings: { ...mem.settings },
      };
    },
    async getSettings() {
      ensureMemSeeded();
      return { ...mem.settings };
    },
    async listReviews() {
      ensureMemSeeded();
      return sortReviewsNewestFirst(mem.reviews.map((r) => ({ ...r })));
    },
    async getReview(id) {
      ensureMemSeeded();
      const r = mem.reviews.find((x) => x.id === id);
      return r ? { ...r } : null;
    },
    async updateSettings(patch) {
      ensureMemSeeded();
      mem.settings = { ...mem.settings, ...patch };
      return { ...mem.settings };
    },
    async addReviews(reviews) {
      ensureMemSeeded();
      // Any non-demo review means real Google data is now configured for the
      // owner's own business. The demo seed reviews are only a pre-configuration
      // placeholder — once real reviews arrive, remove them so demo data never
      // stays mixed in with the owner's real reviews.
      const hasReal = reviews.length > 0 && reviews.some((r) => (r.source ?? "demo") !== "demo");
      const existing = new Set(mem.reviews.map((r) => r.id));
      let added = 0;
      for (const r of reviews) {
        if (existing.has(r.id)) continue;
        existing.add(r.id);
        mem.reviews.unshift({ ...r });
        added++;
      }
      if (hasReal) {
        mem.reviews = mem.reviews.filter((r) => (r.source ?? "demo") !== "demo");
      }
      return added;
    },
    async markAnswered(id, reply, tone, demo) {
      ensureMemSeeded();
      const r = mem.reviews.find((x) => x.id === id);
      if (!r) return null;
      r.status = "answered";
      r.reply = reply;
      r.replyTone = tone;
      r.replyDemo = demo;
      r.repliedAt = new Date().toISOString();
      return { ...r };
    },
    async listCompetitors() {
      ensureMemSeeded();
      return mem.competitors.map((c) => ({
        ...c,
        reviews: sortReviewsNewestFirst(c.reviews.map((r) => ({ ...r }))),
      }));
    },
    async addCompetitor(query, reviews, providedName) {
      ensureMemSeeded();
      // Real competitor reviews (non-demo) configured → demo seed competitors are
      // only placeholders and must be removed so demo never sits alongside real.
      const hasReal = reviews.length > 0 && reviews.some((r) => (r.source ?? "demo") !== "demo");
      if (hasReal) {
        mem.competitors = mem.competitors.filter((c) => c.demo !== true);
      }
      const id = competitorId(query);
      const sorted = sortReviewsNewestFirst(reviews.map((r) => ({ ...r })));
      const existing = mem.competitors.find((c) => c.id === id);
      const competitor: Competitor = {
        id,
        query,
        name: providedName ?? existing?.name ?? null,
        reviews: sorted,
        fetchedAt: new Date().toISOString(),
        demo: false,
      };
      if (existing) {
        Object.assign(existing, competitor);
      } else {
        mem.competitors.unshift(competitor);
      }
      return { ...competitor, reviews: sorted.map((r) => ({ ...r })) };
    },
    async getOwnerReviews() {
      ensureMemSeeded();
      // Competitor reviews live in the competitors list, so the reviews array is
      // exactly the owner's own reviews plus any demo seeds (also the owner's).
      return sortReviewsNewestFirst(mem.reviews.map((r) => ({ ...r })));
    },
  };
}

// ---------------------------------------------------------------------------
// Postgres backend (DATABASE_URL present)
// ---------------------------------------------------------------------------

type Sql = ReturnType<typeof sql>;

function rowToReview(row: Record<string, unknown>): Review {
  return {
    id: String(row.id),
    customer: String(row.customer),
    rating: Number(row.rating),
    text: String(row.text),
    date: String(row.date),
    status: (String(row.status) as Review["status"]),
    reply: row.reply == null ? null : String(row.reply),
    repliedAt: row.replied_at == null ? null : String(row.replied_at),
    replyTone: row.reply_tone == null ? null : (String(row.reply_tone) as Tone),
    replyDemo: row.reply_demo == null ? false : Boolean(row.reply_demo),
    source: row.source == null ? "demo" : (String(row.source) as Review["source"]),
  };
}

function rowToCompetitor(row: Record<string, unknown>): Competitor {
  let reviews: Review[] = [];
  try {
    const parsed = JSON.parse(String(row.reviews ?? "[]"));
    if (Array.isArray(parsed)) {
      reviews = parsed.filter((r): r is Review => r && typeof r === "object");
    }
  } catch {
    reviews = [];
  }
  return {
    id: String(row.id),
    query: String(row.query),
    name: row.name == null ? null : String(row.name),
    reviews: sortReviewsNewestFirst(reviews),
    fetchedAt: String(row.fetched_at),
    demo: row.demo == null ? false : Boolean(row.demo),
  };
}

async function ensureDbSchema(db: Sql): Promise<void> {
  await db`
    create table if not exists reviews (
      id text primary key,
      customer text not null,
      rating integer not null,
      text text not null,
      date text not null,
      status text not null default 'new',
      reply text,
      replied_at text,
      reply_tone text,
      reply_demo boolean not null default false,
      source text not null default 'demo'
    )
  `;
  // Upgrade path for databases created before the `source` column existed.
  await db`
    alter table reviews add column if not exists source text not null default 'demo'
  `;
  await db`
    create table if not exists settings (
      key text primary key,
      value text not null
    )
  `;
  await db`
    create table if not exists competitors (
      id text primary key,
      query text not null,
      name text,
      reviews text not null,
      fetched_at text not null,
      demo boolean not null default false
    )
  `;

  const count = await db`select count(*)::int as n from reviews`;
  if (Number(count[0]?.n) === 0) {
    for (const r of SEED_REVIEWS) {
      await db`
        insert into reviews (id, customer, rating, text, date, status, reply, replied_at, reply_tone, reply_demo, source)
        values (${r.id}, ${r.customer}, ${r.rating}, ${r.text}, ${r.date}, ${r.status}, ${r.reply ?? null}, ${r.repliedAt ?? null}, ${r.replyTone ?? null}, ${r.replyDemo ?? false}, ${r.source ?? "demo"})
      `;
    }
  }

  const settingRows = await db`select count(*)::int as n from settings`;
  if (Number(settingRows[0]?.n) === 0) {
    await db`
      insert into settings (key, value)
      values ('settings', ${JSON.stringify(DEFAULT_SETTINGS)})
    `;
  }

  const compRows = await db`select count(*)::int as n from competitors`;
  if (Number(compRows[0]?.n) === 0) {
    for (const c of SEED_COMPETITORS) {
      await db`
        insert into competitors (id, query, name, reviews, fetched_at, demo)
        values (${c.id}, ${c.query}, ${c.name ?? null}, ${JSON.stringify(c.reviews)}, ${c.fetchedAt}, ${c.demo ?? false})
      `;
    }
  }
}

function createDbStore(db: Sql): Store {
  let ready: Promise<void> | null = null;
  function ensure(): Promise<void> {
    if (!ready) ready = ensureDbSchema(db);
    return ready;
  }

  async function readSettings(): Promise<Settings> {
    const rows = await db`select value from settings where key = 'settings'`;
    const raw = rows[0]?.value;
    if (!raw) return { ...DEFAULT_SETTINGS };
    try {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(String(raw)) as Partial<Settings>) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  return {
    async getState() {
      await ensure();
      const [reviews, settings] = await Promise.all([
        db`select * from reviews order by date desc`,
        readSettings(),
      ]);
      return {
        reviews: sortReviewsNewestFirst(
          reviews.map((r) => rowToReview(r as Record<string, unknown>)),
        ),
        settings,
      };
    },
    async getSettings() {
      await ensure();
      return readSettings();
    },
    async listReviews() {
      await ensure();
      const rows = await db`select * from reviews order by date desc`;
      // SQL already sorts by date desc; re-sort in JS for a consistent, stable
      // (id-tiebreak) order identical to the in-memory backend.
      return sortReviewsNewestFirst(rows.map((r) => rowToReview(r as Record<string, unknown>)));
    },
    async getReview(id) {
      await ensure();
      const rows = await db`select * from reviews where id = ${id} limit 1`;
      return rows[0] ? rowToReview(rows[0] as Record<string, unknown>) : null;
    },
    async updateSettings(patch) {
      await ensure();
      const current = await readSettings();
      const next = { ...current, ...patch };
      await db`
        insert into settings (key, value) values ('settings', ${JSON.stringify(next)})
        on conflict (key) do update set value = excluded.value
      `;
      return next;
    },
    async addReviews(reviews) {
      await ensure();
      // Real (non-demo) owner reviews configured → remove the demo seed
      // placeholder reviews so demo data never mixes with real data.
      const hasReal = reviews.length > 0 && reviews.some((r) => (r.source ?? "demo") !== "demo");
      let added = 0;
      for (const r of reviews) {
        const rows = await db`
          insert into reviews (id, customer, rating, text, date, status, reply, replied_at, reply_tone, reply_demo, source)
          values (${r.id}, ${r.customer}, ${r.rating}, ${r.text}, ${r.date}, ${r.status}, ${r.reply ?? null}, ${r.repliedAt ?? null}, ${r.replyTone ?? null}, ${r.replyDemo ?? false}, ${r.source ?? "demo"})
          on conflict (id) do nothing
          returning id
        `;
        if (rows.length > 0) added++;
      }
      if (hasReal) {
        await db`delete from reviews where source = 'demo'`;
      }
      return added;
    },
    async markAnswered(id, reply, tone, demo) {
      await ensure();
      const rows = await db`
        update reviews
        set status = 'answered', reply = ${reply}, reply_tone = ${tone}, reply_demo = ${demo}, replied_at = ${new Date().toISOString()}
        where id = ${id}
        returning *
      `;
      return rows[0] ? rowToReview(rows[0] as Record<string, unknown>) : null;
    },
    async listCompetitors() {
      await ensure();
      const rows = await db`select * from competitors order by fetched_at desc`;
      return rows.map((r) => rowToCompetitor(r as Record<string, unknown>));
    },
    async addCompetitor(query, reviews, providedName) {
      await ensure();
      // Real competitor reviews configured → remove demo seed competitors so demo
      // never sits alongside real competitor data.
      const hasReal = reviews.length > 0 && reviews.some((r) => (r.source ?? "demo") !== "demo");
      if (hasReal) {
        await db`delete from competitors where demo = true`;
      }
      const id = competitorId(query);
      const existing = await db`select * from competitors where id = ${id} limit 1`;
      const name = providedName ?? (existing[0] ? (existing[0].name as string | null) : null);
      const demo = existing[0] ? Boolean((existing[0] as Record<string, unknown>).demo) : false;
      const fetchedAt = new Date().toISOString();
      const jsonReviews = JSON.stringify(sortReviewsNewestFirst(reviews));
      await db`
        insert into competitors (id, query, name, reviews, fetched_at, demo)
        values (${id}, ${query}, ${name ?? null}, ${jsonReviews}, ${fetchedAt}, ${demo})
        on conflict (id) do update set
          query = excluded.query,
          name = excluded.name,
          reviews = excluded.reviews,
          fetched_at = excluded.fetched_at,
          demo = excluded.demo
      `;
      return { id, query, name, reviews: sortReviewsNewestFirst(reviews), fetchedAt, demo };
    },
    async getOwnerReviews() {
      await ensure();
      const rows = await db`select * from reviews order by date desc`;
      // Competitor reviews live in the competitors table; the reviews table is
      // exactly the owner's own reviews (plus any demo seeds, also the owner's).
      return sortReviewsNewestFirst(rows.map((r) => rowToReview(r as Record<string, unknown>)));
    },
  };
}

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

let storePromise: Promise<Store> | null = null;
let storeUsingMemory = false;

export function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = (async () => {
      if (process.env.DATABASE_URL) {
        try {
          const db = createDbStore(sql());
          storeUsingMemory = false;
          return db;
        } catch {
          // Even a configured-but-broken DB must not take the app down:
          // fall back to memory and let the UI show demo mode.
          storeUsingMemory = true;
          return createMemoryStore();
        }
      }
      storeUsingMemory = true;
      return createMemoryStore();
    })();
  }
  return storePromise;
}

/** True when the app is running without a usable database (demo mode). */
export function isDemoMode(): boolean {
  return !process.env.DATABASE_URL || storeUsingMemory;
}
