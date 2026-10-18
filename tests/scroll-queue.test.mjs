import test from "node:test";
import assert from "node:assert/strict";
import { createProfile, getFeed, normalizeProduct, recordAction } from "../src/utils/feed.mjs";
import { refreshScrollQueue } from "../src/utils/scroll-queue.mjs";

test("refreshing recommendations preserves the current card and prioritizes incoming candidates", () => {
  const first = { id: "first", image: "first.jpg" };
  const second = { id: "second", image: "second.jpg" };
  const replacementFirst = { id: "first", image: "replacement.jpg" };
  const third = { id: "third", image: "third.jpg" };

  const queue = refreshScrollQueue([first, second], [replacementFirst, third]);

  assert.deepEqual(queue, [first, third, second]);
});

test("the first incoming feed initializes an empty Scroll queue", () => {
  const products = [{ id: "first" }, { id: "second" }];

  assert.equal(refreshScrollQueue([], products), products);
});


test("new rankings reorder existing upcoming cards instead of freezing the initial feed", () => {
  const [first, second, third] = ["first", "second", "third"].map(id => ({ id }));
  assert.deepEqual(
    refreshScrollQueue([first, second, third], [third, second, first]),
    [first, third, second],
  );
});

test("refresh preserves the entire visited prefix even when browsing back", () => {
  const [first, second, third, fourth] = ["first", "second", "third", "fourth"].map(id => ({ id }));
  assert.deepEqual(
    refreshScrollQueue([first, second, third, fourth], [fourth, third, second, first], 1),
    [first, second, fourth, third],
  );
});

test("upcoming cards receive refreshed metadata without duplicates", () => {
  const first = { id: "first" };
  const second = { id: "second", similarity: 0.1 };
  const updated = { ...second, similarity: 0.9 };
  assert.deepEqual(
    refreshScrollQueue([first, second], [updated, updated, first, null]),
    [first, updated],
  );
  const queue = [first, second];
  assert.equal(refreshScrollQueue(queue, []), queue);
});


test("liking a card promotes related products in the active scroll session", () => {
  const products = [
    { asin: "A000000001", main_category: "Crafts", subcategory: "Clay kits", hashtags: ["clay"] },
    { asin: "A000000002", main_category: "Electronics", subcategory: "Headphones", hashtags: ["audio"] },
    { asin: "A000000003", main_category: "Crafts", subcategory: "Clay kits", hashtags: ["clay"] },
  ].map(normalizeProduct);
  const now = Date.parse("2026-10-18T12:00:00Z");
  const profile = recordAction(createProfile(), products[0].id, "like", {
    id: "like-event", createdAt: new Date(now).toISOString(),
  });
  const recommendations = getFeed(products, profile, now);
  const queue = refreshScrollQueue(products, recommendations);
  assert.equal(queue[0], products[0]);
  assert.equal(queue[1], products[2]);
});
