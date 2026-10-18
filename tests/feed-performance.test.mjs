import test from "node:test";
import assert from "node:assert/strict";
import {
  getFeed,
  normalizeProduct,
  personalScore,
  restoreProfile,
  score,
} from "../src/utils/feed.mjs";

const now = Date.parse("2026-10-18T09:00:00.000Z");

function makeFixture(productCount = 12, eventCount = 120) {
  const categories = ["Home & kitchen", "Electronics", "Clothing", "Beauty & personal care", "Gaming", null];
  const catalog = Array.from({ length: productCount }, (_, index) => {
    const vector = Array.from({ length: 384 }, (_, dimension) => Math.sin(index + dimension * 0.7));
    const norm = Math.hypot(...vector);
    return normalizeProduct({
      id: `product-${index}`,
      mainCategory: categories[index % categories.length],
      subcategory: index % 5 ? `subcategory-${index % 9}` : null,
      hashtags: index % 3 ? [`tag-${index % 7}`, `#tag_${index % 13}`, "minimalism"] : [],
      price: index % 11 ? 10 + index * 4 : null,
      rating: index % 8 ? 3 + (index % 20) / 10 : null,
      reviews: index * 150,
      boughtInPastMonth: index % 2 ? "1K+ bought" : null,
      badge: index % 3 ? null : "Best seller",
      similarity: index % 6 ? (index % 20) / 10 - 1 : null,
      titleEmbedding: index % 17 ? vector.map((value) => value / norm) : null,
    });
  });
  const actions = ["like", "save", "unsave", "skip", "show_less", "unlike", "too_expensive", "less_category"];
  const profile = restoreProfile({
    preferences: { categories: ["Home", "Clothing"], minPrice: 20, maxPrice: 200 },
    events: Array.from({ length: eventCount }, (_, index) => ({
      productId: `product-${(index * 5 + Math.floor(index / 8)) % (productCount + 2)}`,
      action: actions[index % actions.length],
      createdAt: new Date(now - index * 10_000_000).toISOString(),
      dwellMs: [null, 100, 2000, 5000, 6000][index % 5],
    })),
  });
  return { catalog, profile };
}

test("cached scoring preserves mixed-feedback scores and deterministic exploration order", () => {
  const { catalog, profile } = makeFixture();
  // Recorded before optimizing the scoring context. This covers repeated and
  // missing source products, all actions, semantic vectors, and legacy groups.
  const expectedScores = [
    0, 0.022812844798322685, 0.018786255644861305, 0.09707548948561484,
    0.041717230718144094, 0.46967695583696756, 0.13925987108628307, 0.08314475193870641,
    0.02762155223087842, 0.17478992416870714, 0.10312233219385408, 0.3158447355196137,
  ];
  const expectedPersonalScores = [
    0.016546437212704546, 0.1698515122101468, 0.1653369760004846, 0.21707511992417872,
    0.18136580653504414, 0.2702251346898782, 0.25755160320561127, 0.2035695962082328,
    0.21729498590906735, 0.320165644971521, 0.2609319862976815, 0.23715987351665496,
  ];
  const expectedOrder = [
    "product-5", "product-11", "product-9", "product-6", "product-10", "product-3",
    "product-7", "product-4", "product-8", "product-1", "product-2", "product-0",
  ];
  catalog.forEach((product, index) => {
    assert.ok(Math.abs(score(product, profile, catalog, now) - expectedScores[index]) < 1e-12);
    assert.ok(Math.abs(personalScore(product, profile, catalog, now) - expectedPersonalScores[index]) < 1e-12);
  });
  assert.deepEqual(getFeed(catalog, profile, now).map((product) => product.id), expectedOrder);
});

test("repeated interactions compare title vectors once per candidate/source pair", () => {
  const { catalog, profile } = makeFixture(12, 1000);
  let coordinateReads = 0;
  for (const product of catalog) {
    if (!product.titleEmbedding) continue;
    product.titleEmbedding = new Proxy(product.titleEmbedding, {
      get(vector, key, receiver) {
        if (typeof key === "string" && /^\d+$/.test(key)) coordinateReads += 1;
        return Reflect.get(vector, key, receiver);
      },
    });
  }
  const ranked = getFeed(catalog, profile, now);
  assert.equal(ranked.length, catalog.length);
  const embeddedProducts = catalog.filter((product) => product.titleEmbedding).length;
  assert.ok(coordinateReads > 0, "semantic scoring still compares title vectors");
  assert.ok(
    coordinateReads <= embeddedProducts * (embeddedProducts - 1) * 384 * 4,
    "embedding work should depend on unique product pairs, not repeated interaction count",
  );
});
