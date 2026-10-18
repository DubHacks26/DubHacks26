import test from "node:test";
import assert from "node:assert/strict";
import {
  createProfile,
  getFeed,
  matches,
  normalizeProduct,
  normalizeTag,
  personalScore,
  recordAction,
  removeAction,
  restoreProfile,
  score,
} from "../src/utils/feed.mjs";

const catalog = [
  {
    asin: "A000000001",
    title: "Handmade clay charm craft kit",
    main_category: "Hobbies, toys & entertainment",
    subcategory: "DIY craft kits",
    hashtags: ["#diy_craft_kits", "#clay_charms", "#craft"],
    price_cents: 2500,
    rating: 4.6,
    review_count: 300,
    bought_in_past_month: "100+ bought in past month",
  },
  {
    asin: "A000000002",
    title: "Make your own clay charms DIY kit",
    main_category: "Hobbies, toys & entertainment",
    subcategory: "DIY craft kits",
    hashtags: ["#diy_craft_kits", "#clay_charms"],
    price_cents: 3200,
    rating: 4.5,
    review_count: 100,
    bought_in_past_month: null,
  },
  {
    asin: "A000000003",
    title: "Automatic candy vending machine",
    main_category: "Novelty, gifts & miscellaneous",
    subcategory: "Weird but useful gadgets",
    hashtags: ["#candy_dispenser", "#vending_machine"],
    price_cents: 2500,
    rating: 4.6,
    review_count: 300,
    bought_in_past_month: null,
  },
].map(normalizeProduct);

test("catalog rows normalize ASIN, categories, hashtags, and cents", () => {
  const product = catalog[0];
  assert.equal(product.id, "A000000001");
  assert.equal(product.category, "Hobbies, toys & entertainment");
  assert.equal(product.subcategory, "DIY craft kits");
  assert.deepEqual(product.hashtags, ["diy-craft-kits", "clay-charms", "craft"]);
  assert.equal(product.price, 25);
  assert.equal(normalizeTag("#Coffee_Accessories"), "coffee-accessories");
  assert.deepEqual(normalizeProduct({
    hashtags: '["#coffee_maker"]',
    main_category: null,
  }).hashtags, ["coffee-maker"]);
});

test("likes rank related subcategories, hashtags, and titles more highly", () => {
  const liked = recordAction(createProfile(), catalog[0].id, "like", {
    id: "event-like",
    createdAt: "2026-10-01T00:00:00.000Z",
  });
  const ranked = getFeed(catalog, liked, Date.parse("2026-10-02T00:00:00.000Z"));
  assert.deepEqual(ranked.map((product) => product.id), ["A000000002", "A000000003"]);
  assert.ok(personalScore(catalog[1], liked, catalog) > personalScore(catalog[2], liked, catalog));
});

test("generated hashtag overlap helps outside a selected category", () => {
  const liked = recordAction(createProfile(), catalog[0].id, "like", {
    id: "tag-like",
    createdAt: "2026-10-01T00:00:00.000Z",
  });
  const tagMatch = normalizeProduct({
    asin: "A000000006",
    title: "Decorative serving bowl",
    main_category: "Food",
    subcategory: "Snacks",
    hashtags: ["#clay_charms"],
    price_cents: 2500,
    rating: 4.5,
    review_count: 100,
  });
  const noTagMatch = normalizeProduct({
    ...tagMatch,
    asin: "A000000007",
    hashtags: ["#coffee_grinder"],
  });
  assert.ok(
    personalScore(tagMatch, liked, [...catalog, tagMatch, noTagMatch])
      > personalScore(noTagMatch, liked, [...catalog, tagMatch, noTagMatch]),
  );
});

test("title word overlap does not affect ranking without semantic embeddings", () => {
  const seed = normalizeProduct({
    asin: "A000000008",
    title: "Espresso coffee machine",
    main_category: "Home & kitchen",
    subcategory: "Coffee accessories",
    hashtags: [],
  });
  const coffeeMaker = normalizeProduct({ ...seed, asin: "A000000009", title: "Coffee maker" });
  const candyMachine = normalizeProduct({ ...seed, asin: "A000000010", title: "Candy machine" });
  const candidates = [seed, coffeeMaker, candyMachine];
  const liked = recordAction(createProfile(), seed.id, "like", {
    id: "coffee-like",
    createdAt: new Date().toISOString(),
  });
  assert.equal(personalScore(coffeeMaker, liked, candidates), personalScore(candyMachine, liked, candidates));
});

test("semantic title embeddings favor products with similar meaning", () => {
  const vector = (index, value = 1, secondIndex = -1, secondValue = 0) => {
    const embedding = Array(384).fill(0);
    embedding[index] = value;
    if (secondIndex >= 0) embedding[secondIndex] = secondValue;
    return embedding;
  };
  const seed = normalizeProduct({
    asin: "A000000030",
    title: "Espresso coffee machine",
    main_category: "Home & kitchen",
    subcategory: "Coffee accessories",
    hashtags: [],
    price: 40,
    rating: 4,
    reviews: 10,
    title_embedding: vector(0),
  });
  const semanticMatch = normalizeProduct({
    ...seed,
    asin: "A000000031",
    title: "Compact espresso maker",
    title_embedding: vector(0, 0.8, 1, 0.6),
  });
  const unrelated = normalizeProduct({
    ...seed,
    asin: "A000000032",
    title: "Decorative wall art",
    title_embedding: vector(1),
  });
  const candidates = [seed, semanticMatch, unrelated];
  const liked = recordAction(createProfile(), seed.id, "like", {
    id: "semantic-title-like",
    createdAt: new Date().toISOString(),
  });
  const skipped = recordAction(createProfile(), seed.id, "skip", {
    id: "semantic-title-skip",
    createdAt: new Date().toISOString(),
  });

  assert.ok(personalScore(semanticMatch, liked, candidates) > personalScore(unrelated, liked, candidates));
  assert.ok(personalScore(semanticMatch, skipped, candidates) < personalScore(unrelated, skipped, candidates));
});

test("title embeddings parse Supabase vector text and reject malformed values", () => {
  const unitVector = Array(384).fill(0);
  unitVector[0] = 1;
  const vectorText = `[${unitVector.join(",")}]`;
  assert.equal(normalizeProduct({ title_embedding: vectorText }).titleEmbedding.length, 384);
  assert.equal(normalizeProduct({ title_embedding: "[1,not-a-number]" }).titleEmbedding, null);
  assert.equal(normalizeProduct({ title_embedding: `[${Array(384).fill(0).join(",")}]` }).titleEmbedding, null);
});

test("semantic hashtag similarity contributes to personalization when available", () => {
  const liked = recordAction(createProfile(), catalog[0].id, "like", {
    id: "vector-like",
    createdAt: new Date().toISOString(),
  });
  const vectorMatch = normalizeProduct({
    ...catalog[2],
    asin: "A000000011",
    hashtags: ["unrelated"],
    similarity: 0.9,
  });
  const unrelated = normalizeProduct({
    ...catalog[2],
    asin: "A000000012",
    hashtags: ["unrelated"],
  });
  assert.ok(personalScore(vectorMatch, liked, [...catalog, vectorMatch, unrelated])
    > personalScore(unrelated, liked, [...catalog, vectorMatch, unrelated]));
});

test("price is a soft preference and never filters products out", () => {
  const profile = createProfile();
  profile.preferences = { categories: [], minPrice: 20, maxPrice: 30 };
  const expensive = normalizeProduct({
    asin: "A000000004",
    title: "Clay charm maker kit",
    main_category: "Hobbies, toys & entertainment",
    subcategory: "DIY craft kits",
    hashtags: ["#clay_charms"],
    price_cents: 12000,
    rating: 4.5,
    review_count: 20,
  });
  assert.equal(matches(expensive, profile.preferences), true);
  assert.ok(score(expensive, profile, [...catalog, expensive]) > 0);
  assert.ok(getFeed([...catalog, expensive], profile).some((product) => product.id === expensive.id));
});

test("repeated too-expensive feedback lowers the learned soft price ceiling", () => {
  const rejected = normalizeProduct({
    asin: "A000000020",
    title: "Decorative sculpture",
    price: 100,
  });
  const candidate = normalizeProduct({
    asin: "A000000021",
    title: "Wooden serving tray",
    price: 120,
  });
  const now = Date.parse("2026-10-20T00:00:00.000Z");
  let profile = createProfile();
  profile.preferences.maxPrice = 150;
  for (let index = 0; index < 6; index += 1) {
    profile = recordAction(profile, rejected.id, "too_expensive", {
      id: `price-feedback-${index}`,
      createdAt: "2026-10-20T00:00:00.000Z",
    });
  }

  const baseline = score(candidate, createProfile(), [rejected, candidate], now);
  const learned = score(candidate, profile, [rejected, candidate], now);
  assert.ok(learned < baseline);
});

test("best-seller badges and recent purchase counts contribute only as popularity signals", () => {
  const popular = normalizeProduct({
    ...catalog[2],
    asin: "A000000013",
    bought_in_past_month: null,
    badge: "Amazon's Choice",
  });
  const ordinary = normalizeProduct({
    ...popular,
    asin: "A000000014",
    badge: null,
  });
  const profile = createProfile();
  assert.ok(score(popular, profile, [popular, ordinary]) > score(ordinary, profile, [popular, ordinary]));
  assert.ok(getFeed([popular, ordinary], profile).length === 2);
});

test("category selections do not impose a hard filter", () => {
  const profile = createProfile();
  profile.preferences.categories = ["Home"];
  assert.equal(matches(catalog[0], profile.preferences), true);
});

test("catalog main-category preferences rank exact and legacy broad selections correctly", () => {
  const food = normalizeProduct({
    asin: "A000000030",
    title: "Pantry snack box",
    main_category: "Food",
    price_cents: 2500,
  });
  const school = normalizeProduct({
    asin: "A000000031",
    title: "Notebook set",
    main_category: "School Supplies",
    price_cents: 2500,
  });
  const exactPreference = createProfile();
  exactPreference.preferences.categories = ["Food"];
  assert.ok(score(food, exactPreference, [food, school]) > score(school, exactPreference, [food, school]));

  const legacyPreference = createProfile();
  legacyPreference.preferences.categories = ["Home"];
  const homeProduct = normalizeProduct({
    asin: "A000000032",
    title: "Ceramic bowl",
    main_category: "Kitchen & dining",
    price_cents: 2500,
  });
  const unrelatedProduct = normalizeProduct({
    asin: "A000000033",
    title: "Notebook set",
    main_category: "School Supplies",
    price_cents: 2500,
  });
  assert.ok(
    score(homeProduct, legacyPreference, [homeProduct, unrelatedProduct])
      > score(unrelatedProduct, legacyPreference, [homeProduct, unrelatedProduct]),
  );
});

test("skip and show-less are negative, recency-weighted preference events", () => {
  let profile = recordAction(createProfile(), catalog[0].id, "skip", {
    id: "skip-1",
    createdAt: "2026-10-16T00:00:00.000Z",
  });
  profile = recordAction(profile, catalog[1].id, "show_less", {
    id: "less-1",
    createdAt: "2026-10-16T00:00:00.000Z",
  });
  assert.deepEqual(profile.seen, ["A000000001", "A000000002"]);
  assert.equal(profile.feedback.length, 1);
  assert.equal(getFeed(catalog, profile).length, 1);
});

test("explicit dislike strongly lowers same-category products without filtering them out", () => {
  const disliked = normalizeProduct({
    asin: "A000000040",
    title: "Yoga mat",
    main_category: "Fitness & outdoors",
    price: 25,
  });
  const sameCategory = normalizeProduct({
    asin: "A000000041",
    title: "Hiking backpack",
    main_category: "Fitness & outdoors",
    price: 25,
  });
  const otherCategory = normalizeProduct({
    asin: "A000000042",
    title: "Face cleanser",
    main_category: "Beauty & personal care",
    price: 25,
  });
  const now = Date.parse("2026-10-20T00:00:00.000Z");
  const profile = recordAction(createProfile(), disliked.id, "less_category", {
    id: "dislike-fitness",
    createdAt: "2026-10-20T00:00:00.000Z",
  });

  assert.ok(
    score(sameCategory, profile, [disliked, sameCategory, otherCategory], now)
      < score(otherCategory, profile, [disliked, sameCategory, otherCategory], now) - 0.15,
  );
  assert.ok(
    getFeed([disliked, sameCategory, otherCategory], profile, now)
      .some((product) => product.id === sameCategory.id),
  );
});

test("save and unsave update the wishlist without marking products seen", () => {
  let profile = recordAction(createProfile(), catalog[0].id, "save", {
    id: "save-1",
    createdAt: new Date().toISOString(),
  });
  assert.deepEqual(profile.saved, ["A000000001"]);
  assert.deepEqual(profile.seen, []);
  profile = recordAction(profile, catalog[0].id, "unsave", {
    id: "unsave-1",
    createdAt: new Date().toISOString(),
  });
  assert.deepEqual(profile.saved, []);
});

test("unlike reverses the liked state and less-category feedback has a negative effect", () => {
  let profile = recordAction(createProfile(), catalog[0].id, "like", {
    id: "like",
    createdAt: "2026-10-16T00:00:00.000Z",
  });
  const before = personalScore(catalog[1], profile, catalog);
  profile = recordAction(profile, catalog[0].id, "unlike", {
    id: "unlike",
    createdAt: "2026-10-17T00:00:00.000Z",
  });
  assert.deepEqual(profile.likes, []);

  const lessCategory = recordAction(createProfile(), catalog[0].id, "less_category", {
    id: "less-category",
    createdAt: new Date().toISOString(),
  });
  assert.ok(personalScore(catalog[1], lessCategory, catalog) < before);
});

test("saved preferences and events restore account state", () => {
  const profile = restoreProfile({
    preferences: { categories: ["Home"], minPrice: 35, maxPrice: 125 },
    onboarded: true,
    events: [
      { id: "liked", productId: "A000000001", action: "like", createdAt: "2026-10-01T00:00:00.000Z" },
      { id: "saved", productId: "A000000002", action: "save", createdAt: "2026-10-02T00:00:00.000Z" },
      { id: "skipped", productId: "A000000003", action: "skip", createdAt: "2026-10-03T00:00:00.000Z" },
    ],
  });
  assert.deepEqual(profile.preferences.categories, ["Home"]);
  assert.equal(profile.preferences.minPrice, 35);
  assert.equal(profile.preferences.maxPrice, 125);
  assert.equal(profile.onboarded, true);
  assert.deepEqual(profile.likes, ["A000000001"]);
  assert.deepEqual(profile.saved, ["A000000002"]);
  assert.deepEqual(profile.seen, []);
});

test("undo removes one interaction and recomputes the affected state", () => {
  const liked = recordAction(createProfile(), catalog[0].id, "like", {
    id: "undo-me",
    createdAt: new Date().toISOString(),
  });
  assert.deepEqual(liked.likes, ["A000000001"]);
  const restored = removeAction(liked, "undo-me");
  assert.deepEqual(restored.likes, []);
  assert.deepEqual(restored.seen, []);
});

test("unclassified products remain rankable without invented category matches", () => {
  const unclassified = normalizeProduct({
    asin: "A000000005",
    title: "Portable coffee grinder",
    main_category: null,
    subcategory: null,
    hashtags: [],
    price_cents: 1900,
    rating: null,
    review_count: null,
  });
  assert.equal(unclassified.category, null);
  assert.equal(unclassified.rating, null);
  assert.equal(getFeed([unclassified], createProfile())[0].id, "A000000005");
});


test("filtering a shared ranking preserves the unseen feed order", () => {
  const now = Date.parse("2026-10-02T00:00:00.000Z");
  const profile = recordAction(createProfile(), catalog[0].id, "like", {
    id: "shared-ranking", createdAt: new Date(now).toISOString(),
  });
  const seen = new Set(profile.seen);
  const ranked = getFeed(catalog, { ...profile, seen: [] }, now);
  assert.deepEqual(ranked.filter(product => !seen.has(product.id)), getFeed(catalog, profile, now));
});
