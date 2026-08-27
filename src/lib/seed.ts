import type { Competitor, Review } from "./types";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** ISO timestamp `hoursAgo` hours before now (fractional hours allowed). */
function ago(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * HOUR).toISOString();
}

/**
 * Sample Google reviews for the demo/dashboard feed. Realistic restaurant
 * reviews for a fictional bistro, varied ratings, a mix of praise and
 * complaints, some already answered so the feed shows both statuses.
 * Always surfaced to the UI as sample/demo data — never as real reviews.
 */
export const SEED_REVIEWS: Review[] = [
  {
    id: "rev-001",
    customer: "Melissa Tran",
    rating: 5,
    text: "Came in for a birthday dinner and the team went out of their way to make it special. The short rib was incredible and the tiramisu — I'm still thinking about it. Service was warm and attentive without being pushy.",
    date: ago(3),
    status: "new",
  },
  {
    id: "rev-002",
    customer: "Daniel Okafor",
    rating: 4,
    text: "Solid neighborhood spot. The pasta was fresh and the wine list is well priced for the area. Only reason it's not five stars is the wait for a table on Saturday — book ahead.",
    date: ago(26),
    status: "new",
  },
  {
    id: "rev-003",
    customer: "Priya Raghavan",
    rating: 2,
    text: "Waited 40 minutes for our order on a quiet Tuesday. The burrata was cold and the main came out undercooked. I wanted to love this place but the kitchen seems overwhelmed.",
    date: ago(50),
    status: "new",
  },
  {
    id: "rev-004",
    customer: "Tom Hargrove",
    rating: 5,
    text: "Hands down the best clam chowder I've had since visiting the coast. Generous portions, fair prices, and the staff remembered our drink order on the second visit. We'll be back.",
    date: ago(55),
    status: "new",
  },
  {
    id: "rev-005",
    customer: "Alicia Fernandez",
    rating: 3,
    text: "Good food, confusing service. Our server was lovely but we were charged for a side we never got and the manager was slow to fix it. The squid ink linguine was excellent though.",
    date: ago(100),
    status: "new",
  },
  {
    id: "rev-006",
    customer: "Marcus Webb",
    rating: 1,
    text: "Ordered takeout and it arrived cold and missing the salad. Called twice, nobody picked up until the third try, and they offered no refund. Disappointing for the price.",
    date: ago(130),
    status: "new",
  },
  {
    id: "rev-007",
    customer: "Sofia Lindqvist",
    rating: 5,
    text: "The mushroom risotto is a revelation. Quiet, romantic atmosphere and our waiter paired a perfect wine with it. This is our anniversary spot now.",
    date: ago(150),
    status: "answered",
    reply:
      "Thank you, Sofia — that means the world to us. We're so glad the risotto and the pairing made your evening special, and we'd be honored to host you for many anniversaries to come.",
    repliedAt: ago(140),
    replyTone: "Warm",
    replyDemo: true,
  },
  {
    id: "rev-008",
    customer: "Jamal Carter",
    rating: 4,
    text: "Great lunch spot. The chicken sandwich was juicy and the fries were crispy. Slightly cramped seating, but the food makes up for it.",
    date: ago(200),
    status: "answered",
    reply:
      "Hi Jamal, thank you for the kind words! We're thrilled the chicken sandwich hit the spot. We're also working on a bit more breathing room in the dining area — hope to see you again soon!",
    repliedAt: ago(190),
    replyTone: "Friendly",
    replyDemo: true,
  },
  {
    id: "rev-009",
    customer: "Hannah Brooks",
    rating: 5,
    text: "Brunch here is a must. The avocado toast with poached egg was perfect and the coffee is genuinely good. Friendly staff, reasonable wait even on a Sunday.",
    date: ago(250),
    status: "answered",
    reply:
      "Dear Hannah, thank you for your review. We're delighted that brunch was a hit and that our team took good care of you. We hope to welcome you back soon.",
    repliedAt: ago(240),
    replyTone: "Professional",
    replyDemo: true,
  },
  {
    id: "rev-010",
    customer: "Kevin O'Malley",
    rating: 3,
    text: "Decent dinner but nothing memorable. The pork chop was cooked right but underseasoned. Nice space, and I'd come back for a drink at the bar.",
    date: ago(290),
    status: "new",
  },
];

/**
 * Sample competitor data for the demo/demo-mode flow of the Competitive Review
 * Intelligence feature. Clearly demo data — never presented as real competitor
 * reviews. Each competitor has positive reviews (their strengths) and negative
 * ones (their weaknesses) so the analysis has real material to work with.
 */
export const SEED_COMPETITORS: Competitor[] = [
  {
    id: "comp-olive-grove",
    query: "Olive Grove Trattoria",
    name: "Olive Grove Trattoria (Demo)",
    demo: true,
    fetchedAt: new Date(Date.now() - 2 * DAY).toISOString(),
    reviews: [
      {
        id: "comp-og-1",
        customer: "Rosa Delgado",
        rating: 5,
        text: "The staff treated us like family from the moment we walked in. Warm welcome and genuinely attentive service the whole night.",
        date: ago(20),
        status: "new",
        source: "demo",
      },
      {
        id: "comp-og-2",
        customer: "Ethan Cole",
        rating: 5,
        text: "Beautiful candlelit atmosphere, perfect for a date night. Romantic and cozy without feeling stuffy.",
        date: ago(40),
        status: "new",
        source: "demo",
      },
      {
        id: "comp-og-3",
        customer: "Nadia Zaki",
        rating: 4,
        text: "Delicious handmade pasta and the waiter remembered us from last month. Lovely personal touch.",
        date: ago(70),
        status: "new",
        source: "demo",
      },
      {
        id: "comp-og-4",
        customer: "Peter Lindqvist",
        rating: 2,
        text: "Long wait even with a reservation, and the kitchen seemed overwhelmed on a Saturday night.",
        date: ago(90),
        status: "new",
        source: "demo",
      },
      {
        id: "comp-og-5",
        customer: "Mia Santos",
        rating: 3,
        text: "The food was good but prices have crept up and the portions are getting smaller.",
        date: ago(110),
        status: "new",
        source: "demo",
      },
    ],
  },
  {
    id: "comp-rusty-fork",
    query: "The Rusty Fork BBQ",
    name: "The Rusty Fork (Demo)",
    demo: true,
    fetchedAt: new Date(Date.now() - DAY).toISOString(),
    reviews: [
      {
        id: "comp-rf-1",
        customer: "Dwayne Carter",
        rating: 5,
        text: "Incredible burgers cooked exactly right, and the craft beer list is fantastic.",
        date: ago(15),
        status: "new",
        source: "demo",
      },
      {
        id: "comp-rf-2",
        customer: "Lena Park",
        rating: 5,
        text: "Best fries in town, crispy and perfectly seasoned. The live music on Fridays is a great touch.",
        date: ago(35),
        status: "new",
        source: "demo",
      },
      {
        id: "comp-rf-3",
        customer: "Greg Osei",
        rating: 4,
        text: "Great food and a lively vibe, though it gets pretty loud when it's full.",
        date: ago(60),
        status: "new",
        source: "demo",
      },
      {
        id: "comp-rf-4",
        customer: "Tina Brooks",
        rating: 1,
        text: "Waited 45 minutes for a table and then another 30 for our food. The service was inattentive.",
        date: ago(80),
        status: "new",
        source: "demo",
      },
      {
        id: "comp-rf-5",
        customer: "Omar Farouk",
        rating: 2,
        text: "Overpriced for what you get and the portions are small. Not worth the buzz.",
        date: ago(100),
        status: "new",
        source: "demo",
      },
    ],
  },
];
