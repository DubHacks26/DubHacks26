import test from "node:test";
import assert from "node:assert/strict";
import { appendToScrollQueue } from "../src/utils/scroll-queue.mjs";

test("refreshing recommendations appends new cards without replacing the current queue", () => {
  const first = { id: "first", image: "first.jpg" };
  const second = { id: "second", image: "second.jpg" };
  const replacementFirst = { id: "first", image: "replacement.jpg" };
  const third = { id: "third", image: "third.jpg" };

  const queue = appendToScrollQueue([first, second], [replacementFirst, third]);

  assert.deepEqual(queue, [first, second, third]);
});

test("the first incoming feed initializes an empty Scroll queue", () => {
  const products = [{ id: "first" }, { id: "second" }];

  assert.equal(appendToScrollQueue([], products), products);
});
