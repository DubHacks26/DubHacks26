import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMBEDDING_DIMENSIONS, MAX_INTERESTS, SIMILARITY_THRESHOLD, LEARNING_RATE,
  validateVector, normalizeVector, dotProduct, cosineSimilarity,
  weightedUpdate, closestInterest, shouldCreateInterest, updateInterests,
} from '../lib/vector.mjs';
import {
  hashtagsToText, titleToText, embedHashtags, embedTitle, embedCatalogTitle,
} from '../lib/product-embeddings.mjs';

const axis = index => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => i === index ? 1 : 0);
const near = (left, right, tolerance = 1e-8) => assert.ok(Math.abs(left - right) < tolerance, `${left} != ${right}`);

test('hashtags become natural-language text; empty tags have no embedding', async () => {
  assert.equal(hashtagsToText(['#coffee_machine', 'kitchen_appliances', 'espresso']), 'coffee machine, kitchen appliances, espresso');
  assert.equal(hashtagsToText([]), '');
  assert.equal(await embedHashtags([]), null);
});

test('titles are embedded separately from hashtag lists', async () => {
  assert.equal(titleToText('  Compact\nCoffee   Maker  '), 'Compact Coffee Maker');
  assert.equal(titleToText(null), '');
  assert.equal(await embedTitle(''), null);
  const title = await embedTitle('Compact coffee maker');
  assert.equal(title.length, EMBEDDING_DIMENSIONS);
  near(Math.hypot(...title), 1, 1e-5);

  const calls = [];
  const saved = await embedCatalogTitle({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: true, error: null };
    },
  }, { asin: 'B012345678', title: 'Compact coffee maker' });
  assert.equal(saved, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'save_catalog_title_embedding');
  assert.equal(calls[0].args.p_asin, 'B012345678');
  assert.equal(calls[0].args.p_title, 'Compact coffee maker');
  const savedVector = JSON.parse(calls[0].args.p_embedding);
  assert.equal(savedVector.length, EMBEDDING_DIMENSIONS);
  near(Math.hypot(...savedVector), 1, 1e-5);
});

test('vector functions validate dimensions and normalize updates', () => {
  assert.throws(() => validateVector([1, 2]));
  assert.throws(() => normalizeVector(Array(EMBEDDING_DIMENSIONS).fill(0)));
  const first = axis(0), second = axis(1);
  near(dotProduct(first, second), 0);
  near(cosineSimilarity(first, first), 1);
  const updated = weightedUpdate(first, second);
  near(Math.hypot(...updated), 1);
  near(updated[0] / updated[1], (1 - LEARNING_RATE) / LEARNING_RATE);
});

test('first interaction initializes a slot; similar products update it at constant rate', () => {
  const first = axis(0);
  const initialized = updateInterests([], first);
  assert.equal(initialized.length, 1);
  assert.equal(initialized[0].slotIndex, 0);
  const product = normalizeVector(first.map((x, i) => x + (i === 1 ? 0.1 : 0)));
  const updated = updateInterests(initialized, product);
  assert.equal(updated.length, 1);
  const expected = weightedUpdate(first, product, LEARNING_RATE);
  near(dotProduct(updated[0].embedding, expected), 1);
  near(Math.hypot(...updated[0].embedding), 1);
  assert.ok(closestInterest(initialized, product).similarity >= SIMILARITY_THRESHOLD);
});

test('dissimilar products fill five slots, then update the closest slot', () => {
  let interests = [];
  for (let index = 0; index < MAX_INTERESTS; index++) {
    interests = updateInterests(interests, axis(index));
    assert.equal(interests.length, index + 1);
  }
  const product = normalizeVector(axis(0).map((value, index) => value * 0.1 + (index === 5 ? 1 : 0)));
  assert.equal(shouldCreateInterest(interests, closestInterest(interests, product)), false);
  const updated = updateInterests(interests, product);
  assert.equal(updated.length, MAX_INTERESTS);
  assert.deepEqual(updated.slice(1), interests.slice(1));
  near(Math.hypot(...updated[0].embedding), 1);
  assert.ok(updated[0].embedding[5] > 0);
});

test('real model returns normalized 384D vectors with sensible semantic similarity', async () => {
  const coffee = await embedHashtags(['coffee_machine']);
  const espresso = await embedHashtags(['espresso_machine']);
  const gaming = await embedHashtags(['gaming_keyboard']);
  const shoes = await embedHashtags(['running_shoes']);
  for (const embedding of [coffee, espresso, gaming, shoes]) {
    assert.equal(embedding.length, EMBEDDING_DIMENSIONS);
    near(Math.hypot(...embedding), 1, 1e-5);
  }
  assert.ok(cosineSimilarity(coffee, espresso) > cosineSimilarity(coffee, gaming));
  assert.ok(cosineSimilarity(coffee, espresso) > cosineSimilarity(coffee, shoes));
});
