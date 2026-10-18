import test from "node:test";
import assert from "node:assert/strict";
import { loadSearchScrollProducts } from "../src/utils/search-scroll-loading.mjs";

const match = (asin, title = asin) => ({ asin, title, image_url: "https://m.media-amazon.com/example.jpg", similarity: 0.8 });

test("search cards become usable before detail metadata resolves, in bounded batches", async () => {
  const rows = [match("B000000001"), match("B000000002"), match("B000000003")];
  const updates = [];
  const requests = [];
  let resolveFirst;
  const firstDetails = new Promise(resolve => { resolveFirst = resolve; });
  const loading = loadSearchScrollProducts(rows, {
    batchSize: 2,
    onProducts: products => updates.push(products),
    loadDetails: asins => {
      requests.push(asins);
      return requests.length === 1 ? firstDetails : Promise.resolve([]);
    },
  });

  assert.deepEqual(updates[0].map(product => product.id), rows.map(row => row.asin));
  assert.equal(updates[0][0].image, rows[0].image_url);
  assert.deepEqual(requests, [["B000000001", "B000000002"]]);
  resolveFirst([{ asin: "B000000001", title: "Hydrated name", title_embedding: "[]" }]);
  await loading;
  assert.deepEqual(requests, [["B000000001", "B000000002"], ["B000000003"]]);
  assert.equal(updates.at(-1)[0].name, "Hydrated name");
});

test("detail responses cannot add unrelated products, reorder matches, or replace relevance", async () => {
  const rows = [match("B000000001"), match("B000000002")];
  const products = await loadSearchScrollProducts(rows, {
    onProducts: () => {},
    loadDetails: async () => [
      { asin: "B000000002", title: "Second detail", similarity: 0.1 },
      { asin: "B000000099", title: "Unrelated" },
    ],
  });
  assert.deepEqual(products.map(product => product.id), rows.map(row => row.asin));
  assert.equal(products[0].name, "B000000001");
  assert.equal(products[1].name, "Second detail");
  assert.equal(products[1].similarity, 0.8);
});

test("failed detail batches leave search cards usable and allow later batches to hydrate", async () => {
  let requests = 0;
  const updates = [];
  const products = await loadSearchScrollProducts([match("B000000001"), match("B000000002")], {
    batchSize: 1,
    onProducts: products => updates.push(products),
    loadDetails: async (asins) => {
      if (++requests === 1) throw new Error("Details unavailable");
      return [{ asin: asins[0], title: "Second detail" }];
    },
  });
  assert.equal(products.length, 2);
  assert.equal(products[0].name, "B000000001");
  assert.equal(products[1].name, "Second detail");
  assert.equal(updates.length, 2);
});

test("leaving a search prevents stale hydration updates and further batch requests", async () => {
  let active = true;
  let resolveDetails;
  const pending = new Promise(resolve => { resolveDetails = resolve; });
  const requests = [];
  const updates = [];
  const loading = loadSearchScrollProducts([match("B000000001"), match("B000000002")], {
    batchSize: 1,
    isActive: () => active,
    onProducts: products => updates.push(products),
    loadDetails: asins => {
      requests.push(asins);
      return pending;
    },
  });
  active = false;
  resolveDetails([{ asin: "B000000001", title: "Stale update" }]);
  await loading;
  assert.equal(updates.length, 1);
  assert.equal(requests.length, 1);
});
