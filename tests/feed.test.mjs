import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProduct, normalizeTag, createProfile, restoreProfile, getFeed, recordAction, explainProduct, productChips } from '../src/utils/feed.mjs';
const catalog = [
  { id: 'a', category: 'Home', price: 40, name: 'Lamp', hashtags: ['#minimalism', '#white'] },
  { id: 'b', category: 'Home', price: 80, name: 'Vase', styles: ['minimalist'], colors: ['white'] },
  { id: 'c', category: 'Fashion', price: 20, name: 'Shoes', styles: ['practical'], colors: ['black'] },
].map(normalizeProduct);

test('API images and hashtag aliases normalize into canonical product fields', () => {
  const p = normalizeProduct({ category: 'Home Decor', imageUrl: 'https://example.com/lamp.jpg', hashtags: ['#minimalism', '#minimalist', '#warm_tones'] });
  assert.equal(p.category, 'Home'); assert.equal(p.image, 'https://example.com/lamp.jpg');
  assert.deepEqual(p.styles, ['minimalist']); assert.deepEqual(p.colors, ['neutral']);
  assert.equal(normalizeTag('#Technology'), 'electronics');
  assert.equal(normalizeProduct({}).image, '/product-placeholder.svg');
});
test('only inclusive price bounds filter; unmatched tastes still appear', () => {
  const p = createProfile();
  p.preferences = { categories: ['Gaming'], styles: ['sustainable'], colors: ['green'], minPrice: 40, maxPrice: 80 };
  assert.deepEqual(getFeed(catalog, p).map(p => p.id), ['a', 'b']);
  p.preferences.maxPrice = 40;
  assert.deepEqual(getFeed(catalog, p).map(p => p.id), ['a']);
  p.preferences.minPrice = 41; p.preferences.maxPrice = 79;
  assert.equal(getFeed(catalog, p).length, 0);
});
test('category preferences boost ranking', () => {
  for (const preferences of [{ categories: ['Fashion'] }]) {
    const p = createProfile(); p.preferences = { ...p.preferences, ...preferences };
    assert.deepEqual(getFeed(catalog, p).map(p => p.id), ['c', 'a', 'b']);
  }
});
test('saved profiles migrate category names and drop retired style and color preferences', () => {
  const p = restoreProfile({ preferences: { categories: ['Tech', 'Books', 'Gaming'], styles: ['minimalist'], colors: ['pink'] } });
  assert.deepEqual(p.preferences.categories, ['Electronics', 'Education', 'Gaming']);
  assert.equal('styles' in p.preferences, false);
  assert.equal('colors' in p.preferences, false);
});
test('likes and skips advance a finite feed without saving to wishlist', () => {
  let p = recordAction(createProfile(), 'a', 'like');
  assert.deepEqual(p.likes, ['a']); assert.deepEqual(p.saved, []);
  assert.equal(getFeed(catalog, p)[0].id, 'b');
  p = recordAction(p, 'b', 'skip'); p = recordAction(p, 'c', 'skip');
  assert.equal(getFeed(catalog, p).length, 0);
  assert.deepEqual(p.skips, ['b', 'c']);
});
test('negative feedback changes ranking without changing explicit settings', () => {
  for (const reason of ['style', 'category', 'price']) {
    const before = createProfile();
    const after = recordAction(before, 'a', reason);
    assert.deepEqual(after.preferences, before.preferences);
    assert.equal(getFeed(catalog, after)[0].id, 'c');
  }
});
test('explanations reflect likes or selected preferences; tags have honest prices', () => {
  let p = recordAction(createProfile(), 'a', 'like');
  assert.match(explainProduct(catalog[1], p, catalog), /Because you liked Lamp/);
  p = createProfile(); assert.match(explainProduct(catalog[1], p, catalog), /Explore something new/);
  p.preferences.categories = ['Home']; assert.match(explainProduct(catalog[1], p, catalog), /selected home/);
  assert.deepEqual(productChips(catalog[0]), ['Home', 'Under $50']);
  assert.equal(productChips({ category: 'Home', styles: [], price: 50 }).at(-1), 'Under $100');
});
test('stored profiles roundtrip and corrupted fields do not break the feed', () => {
  let p = recordAction(createProfile(), 'a', 'like'); p.saved = ['b']; p.onboarded = true;
  assert.deepEqual(restoreProfile(JSON.parse(JSON.stringify(p))), p);
  const repaired = restoreProfile({ likes: 'oops', seen: [null], preferences: { categories: ['Unknown'], minPrice: -1 }, feedback: [null] });
  assert.equal(getFeed(catalog, repaired).length, 3);
});

test('Undo restores the feed action while keeping a later bookmark', async () => {
  const { captureFeedState, undoFeedAction } = await import('../src/utils/feed.mjs');
  const before = createProfile();
  const previous = captureFeedState(before);
  const after = { ...recordAction(before, 'a', 'style'), saved: ['b'] };
  const restored = undoFeedAction(after, previous);
  assert.deepEqual(restored.feedback, []);
  assert.deepEqual(restored.seen, []);
  assert.deepEqual(restored.saved, ['b']);
  assert.equal(getFeed(catalog, restored)[0].id, 'a');
});
