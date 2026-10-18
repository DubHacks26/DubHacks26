import test from "node:test";
import assert from "node:assert/strict";
import { cartTotal, restoreCart, toCartItem } from "../src/utils/cart.mjs";

test("cart items keep catalog details and link to the Amazon ASIN", () => {
  assert.deepEqual(toCartItem({
    id: "B000000001",
    asin: "B000000001",
    name: "Test product",
    brand: "Example",
    image: "/product.png",
    price: 14.5,
  }), {
    id: "B000000001",
    asin: "B000000001",
    name: "Test product",
    brand: "Example",
    image: "/product.png",
    price: 14.5,
    amazonUrl: "https://www.amazon.com/dp/B000000001",
  });
});

test("cart rejects products without a valid price or Amazon listing", () => {
  assert.equal(toCartItem({ id: "B000000001", name: "No price", price: null }), null);
  assert.equal(toCartItem({ id: "demo-1", name: "No listing", price: 10 }), null);
  assert.equal(toCartItem({
    id: "demo-1",
    name: "Not an Amazon listing",
    price: 10,
    productUrl: "https://example.com/product",
  }), null);
});

test("restore cart removes invalid and duplicate items and totals listed prices", () => {
  const restored = restoreCart([
    { id: "B000000001", name: "First", price: 12.99 },
    { id: "B000000001", name: "Duplicate", price: 12.99 },
    { id: "B000000002", name: "Second", price: 3 },
    { id: "invalid", name: "Invalid", price: null },
  ]);
  assert.equal(restored.length, 2);
  assert.equal(restored[0].name, "First");
  assert.equal(cartTotal(restored), 15.99);
});
