import test from 'node:test';
import assert from 'node:assert/strict';
import names from '../lib/hashtag-names.cjs';
import graphApi from '../api/hashtags.js';
import { embedHashtag } from '../lib/hashtag-embeddings.mjs';
import { cosineSimilarity } from '../lib/vector.mjs';

test('individual hashtag names normalize and deduplicate across products', () => {
  assert.equal(names.normalizeHashtag('  ##Coffee__MACHINE  '), 'coffee machine');
  assert.equal(names.normalizeHashtag('#  Espresso_ Machine\n'), 'espresso machine');
  assert.equal(names.normalizeHashtag(null), '');
  assert.deepEqual(names.uniqueHashtagNames([
    { hashtags: ['#Coffee_Machine', 'coffee machine', '#espresso', null, '#___'] },
    { hashtags: ['#ESPRESSO', '#coffee_machine'] }, { hashtags: null },
  ]), ['coffee machine', 'espresso']);
});

test('individual hashtag inference produces unit 384D vectors with semantic relationships', async () => {
  assert.equal(await embedHashtag(' #__ '), null);
  const coffee = await embedHashtag('#COFFEE_machine');
  const equivalent = await embedHashtag('coffee machine');
  const espresso = await embedHashtag('#espresso_machine');
  const keyboard = await embedHashtag('#gaming_keyboard');
  for (const vector of [coffee, equivalent, espresso, keyboard]) {
    assert.equal(vector.length, 384);
    assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-6);
  }
  assert.deepEqual(coffee, equivalent);
  assert.ok(cosineSimilarity(coffee, espresso) > cosineSimilarity(coffee, keyboard));
});

const response = () => ({
  code: 200, body: undefined,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
});

test('graph API validates bounds, normalizes queries, and handles empty/isolated graphs', async () => {
  const calls = [];
  let graph = { nodes: [], links: [] };
  const request = { query: {}, catalogSupabase: {
    rpc: async (name, args) => { calls.push({ name, args }); return { data: graph }; },
  } };
  let res = response();
  await graphApi.handleGraph(request, res);
  assert.deepEqual(res.body, graph);
  assert.deepEqual(calls[0], { name: 'get_hashtag_graph', args: {
    p_name: null, p_limit: 100, p_link_limit: 500,
  } });
  graph = { nodes: [{ id: 'uuid', name: 'coffee_machine' }], links: [] };
  request.query = { hashtag: '#COFFEE_machine', limit: '1', linkLimit: '1' };
  res = response();
  await graphApi.handleGraph(request, res);
  assert.deepEqual(res.body, graph);
  assert.equal(calls.at(-1).args.p_name, 'coffee machine');

  for (const query of [{ limit: '301' }, { limit: '0' }, { limit: '1.5' },
    { linkLimit: '2001' }, { limit: ['2'] }, { hashtag: {} }, { hashtag: '#_' },
    { hashtag: 'a'.repeat(513) }, { limit: 'Infinity' }]) {
    const before = calls.length;
    request.query = query;
    res = response();
    await graphApi.handleGraph(request, res);
    assert.equal(res.code, 400);
    assert.equal(calls.length, before);
  }
  request.query = { limit: '300', linkLimit: '2000' };
  res = response();
  await graphApi.handleGraph(request, res);
  assert.equal(res.code, 200);
  request.catalogSupabase = null;
  res = response();
  await graphApi.handleGraph(request, res);
  assert.equal(res.code, 503);
});
