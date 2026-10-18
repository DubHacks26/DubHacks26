import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { normalizeVector, weightedUpdate, dotProduct, EMBEDDING_DIMENSIONS } from '../lib/vector.mjs';
import config from '../lib/recommendation-config.cjs';

const axis = index => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => i === index ? 1 : 0);
const vectorText = vector => `[${vector.join(',')}]`;
const parseVector = value => typeof value === 'string' ? JSON.parse(value) : value;

test('database enforces idempotent, concurrent five-slot interests and interleaved recommendations', {
  skip: process.env.RUN_DB_INTEGRATION_TESTS !== '1' && 'Set RUN_DB_INTEGRATION_TESTS=1 after applying the migration',
}, async () => {
  nextEnv.loadEnvConfig(process.cwd(), true);
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && key, 'Supabase URL and server key are required');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const users = [];
  const asins = [];
  const check = ({ data, error }) => { if (error) throw error; return data; };
  const createUser = async () => {
    const user = check(await db.auth.admin.createUser({
      email: `recommendation-test-${randomUUID()}@example.invalid`,
      password: randomUUID(), email_confirm: true,
    })).user;
    users.push(user.id);
    return user.id;
  };
  const addProduct = async (embedding, hashtag = '#test_product') => {
    const asin = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    asins.push(asin);
    const now = new Date().toISOString();
    check(await db.from('catalog_products').insert({
      asin, title: `Recommendation test ${asin}`, product_url: 'https://example.com',
      captured_at: now, last_seen_at: now,
      hashtags: hashtag ? [hashtag] : [],
      embedding: embedding && vectorText(embedding),
    }));
    return asin;
  };
  const interact = (userId, asin) => db.rpc('record_positive_product_interaction', {
    p_user_id: userId, p_asin: asin, p_action: 'like',
    p_threshold: config.SIMILARITY_THRESHOLD,
    p_learning_rate: config.LEARNING_RATE,
  }).then(check);
  const interests = async userId => check(await db.from('user_interest_embeddings')
    .select('slot_index, embedding').eq('user_id', userId).order('slot_index'));
  try {
    const userId = await createUser();
    const coldUserId = await createUser();
    const first = await addProduct(axis(0), '#coffee_machine');
    const similarVector = normalizeVector(axis(0).map((value, index) => 0.8 * value + (index === 6 ? 0.6 : 0)));
    const similar = await addProduct(similarVector, '#espresso_machine');
    const orthogonal = await Promise.all([1, 2, 3, 4].map(index => addProduct(axis(index))));
    const missing = await addProduct(null, null);

    const fallback = check(await db.rpc('recommend_catalog_products', {
      p_user_id: coldUserId, p_limit: 10, p_exclude_asins: [],
    }));
    assert.ok(fallback.length > 0);
    assert.equal(await interact(userId, first), true);
    assert.equal((await interests(userId)).length, 1);
    assert.deepEqual(await Promise.all([interact(userId, similar), interact(userId, similar)]).then(checkResults => checkResults.sort()), [false, true]);
    let rows = await interests(userId);
    assert.equal(rows.length, 1);
    assert.ok(dotProduct(parseVector(rows[0].embedding), weightedUpdate(axis(0), similarVector)) > 0.999999);
    assert.equal(await interact(userId, missing), false);

    assert.deepEqual((await Promise.all(orthogonal.map(asin => interact(userId, asin)))).sort(), [true, true, true, true]);
    rows = await interests(userId);
    assert.deepEqual(rows.map(row => row.slot_index), [0, 1, 2, 3, 4]);
    const before = parseVector(rows[0].embedding);
    const novelVector = normalizeVector(axis(0).map((value, index) => value * 0.1 + (index === 7 ? 1 : 0)));
    const novel = await addProduct(novelVector, '#running_shoes');
    assert.equal(await interact(userId, novel), true);
    rows = await interests(userId);
    assert.equal(rows.length, 5);
    assert.ok(dotProduct(parseVector(rows[0].embedding), weightedUpdate(before, novelVector, config.NOVEL_INTEREST_LEARNING_RATE)) > 0.999999);

    const recommendations = check(await db.rpc('recommend_catalog_products', {
      p_user_id: userId, p_limit: 20, p_exclude_asins: [first],
    }));
    assert.equal(recommendations.length, new Set(recommendations.map(product => product.asin)).size);
    assert.ok(orthogonal.filter(asin => recommendations.some(product => product.asin === asin)).length >= 2);
    assert.ok(recommendations.every(product => product.asin !== first));
  } finally {
    if (asins.length) await db.from('catalog_products').delete().in('asin', asins);
    for (const userId of users) await db.auth.admin.deleteUser(userId);
  }
});
