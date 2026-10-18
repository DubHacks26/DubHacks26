import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

const axis = index => Array.from({ length: 384 }, (_, i) => i === index ? 1 : 0);
const vectorText = value => `[${value.join(',')}]`;

test('negative semantic feedback is scoped, normalized, and server-only', async t => {
  const db = await PGlite.create({ extensions: { vector } });
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  `);
  for (const migration of [
    '20261017230000_create_catalog_products.sql',
    '20261017231000_remove_catalog_product_capture_fields.sql',
    '20261017232000_add_catalog_product_hashtags.sql',
    '20261017233000_catalog_recommendations.sql',
    '20261018010000_hashtag_graph.sql',
    '20261018020000_personalized_feed.sql',
    '20261018030000_feed_feedback_actions.sql',
    '20261018040000_catalog_title_embeddings.sql',
    '20261018050000_negative_semantic_feedback.sql',
    '20261018060000_semantic_search_and_retention.sql',
  ]) await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));

  const users = {
    skips: '00000000-0000-0000-0000-000000000101',
    price: '00000000-0000-0000-0000-000000000102',
    category: '00000000-0000-0000-0000-000000000103',
    retained: '00000000-0000-0000-0000-000000000104',
    search: '00000000-0000-0000-0000-000000000105',
  };
  await db.query('insert into auth.users(id) select unnest($1::uuid[])', [Object.values(users)]);

  async function addProduct(asin, embedding, {
    priceCents = 5000,
    category = 'Electronics',
    titleEmbedding = null,
  } = {}) {
    await db.query(`insert into public.catalog_products(
      asin, title, product_url, captured_at, last_seen_at, hashtags,
      price_cents, main_category, embedding, title_embedding
    ) values (
      $1, $1, 'https://example.com', now(), now(), ARRAY['#test_product'],
      $2, $3, $4::extensions.vector, $5::extensions.vector
    )`, [
      asin, priceCents, category,
      embedding ? vectorText(embedding) : null,
      titleEmbedding ? vectorText(titleEmbedding) : null,
    ]);
  }

  async function negative(userId, asin, action, dwellMs = null) {
    const result = await db.query(`select public.record_negative_product_interaction(
      $1, $2, $3, $4) as applied`, [userId, asin, action, dwellMs]);
    return result.rows[0].applied;
  }

  async function positive(userId, asin) {
    const result = await db.query(`select public.record_positive_product_interaction(
      $1, $2, 'like', 0.65, 0.1) as applied`, [userId, asin]);
    return result.rows[0].applied;
  }

  await t.test('quick skips are weak negatives, with retries remaining idempotent', async () => {
    await addProduct('NEG0000001', axis(0));
    await addProduct('NEG0000003', null);

    assert.equal(await negative(users.skips, 'NEG0000001', 'skip', 1999), true);
    assert.equal(await negative(users.skips, 'NEG0000001', 'skip', 1999), false);
    assert.equal(await negative(users.skips, 'NEG0000003', 'skip', 1999), false);

    const rows = (await db.query(`select slot_index, signal_strength, embedding
      from public.user_skip_interest_embeddings where user_id = $1 order by slot_index`, [users.skips])).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].signal_strength, 0.2);
    assert.ok(Math.abs(Math.hypot(...JSON.parse(rows[0].embedding)) - 1) < 1e-6);

    const events = (await db.query(`select asin, dwell_ms, skip_kind
      from public.negative_product_interactions where user_id = $1 order by asin`, [users.skips])).rows;
    assert.deepEqual(events, [
      { asin: 'NEG0000001', dwell_ms: 1999, skip_kind: 'quick' },
    ]);
  });

  await t.test('retained views weakly reinforce a matching interest and are idempotent', async () => {
    await addProduct('RET0000001', axis(0));
    const nearby = Array.from({ length: 384 }, (_, index) =>
      index === 0 ? 0.8 : index === 1 ? 0.6 : 0);
    await addProduct('RET0000002', nearby);
    assert.equal(await positive(users.retained, 'RET0000001'), true);

    const first = await db.query(`select public.record_retained_product_interaction(
      $1, 'RET0000002', 5001) as applied`, [users.retained]);
    const duplicate = await db.query(`select public.record_retained_product_interaction(
      $1, 'RET0000002', 7000) as applied`, [users.retained]);
    assert.equal(first.rows[0].applied, true);
    assert.equal(duplicate.rows[0].applied, false);

    const interests = (await db.query(`select slot_index, embedding
      from public.user_interest_embeddings where user_id = $1`, [users.retained])).rows;
    assert.equal(interests.length, 1);
    assert.ok(JSON.parse(interests[0].embedding)[0] > 0.99);
    assert.ok(JSON.parse(interests[0].embedding)[1] > 0);
  });

  await t.test('title semantic search orders matches and submitted queries add a weak preference once', async () => {
    await addProduct('SEA0000001', axis(0), { titleEmbedding: axis(0) });
    await addProduct('SEA0000002', axis(1), { titleEmbedding: axis(1) });
    const results = (await db.query(`select asin, similarity
      from public.search_catalog_products_by_title($1::extensions.vector, 10)`,
    [vectorText(axis(0))])).rows;
    assert.equal(results[0].asin, 'SEA0000001');
    assert.ok(Number(results[0].similarity) > Number(results[1].similarity));

    const queryKey = 'a'.repeat(64);
    const learned = await db.query(`select public.record_search_product_interaction(
      $1, 'SEA0000001', $2) as applied`, [users.search, queryKey]);
    const duplicate = await db.query(`select public.record_search_product_interaction(
      $1, 'SEA0000001', $2) as applied`, [users.search, queryKey]);
    assert.equal(learned.rows[0].applied, true);
    assert.equal(duplicate.rows[0].applied, false);
    assert.equal((await db.query(`select count(*)::int as count
      from public.user_interest_embeddings where user_id = $1`, [users.search])).rows[0].count, 1);
  });

  await t.test('price and category feedback lower only the relevant recommendation contexts', async () => {
    await addProduct('PRI0000001', axis(2), { priceCents: 3000, category: 'Electronics' });
    await addProduct('PRI0000002', axis(2), { priceCents: 10000, category: 'Electronics' });
    await addProduct('PRI0000003', axis(2), { priceCents: 9500, category: 'Electronics' });
    await addProduct('PRI0000004', axis(2), { priceCents: 7000, category: 'Electronics' });
    assert.equal(await positive(users.price, 'PRI0000001'), true);
    assert.equal(await negative(users.price, 'PRI0000002', 'too_expensive'), true);

    const priceSignal = (await db.query(`select price_ceiling_cents, signal_strength, embedding
      from public.user_price_interest_embeddings where user_id = $1`, [users.price])).rows[0];
    assert.equal(priceSignal.price_ceiling_cents, 8000);
    assert.ok(priceSignal.signal_strength > 0);
    assert.ok(Math.abs(Math.hypot(...JSON.parse(priceSignal.embedding)) - 1) < 1e-6);

    const priceRecommendations = (await db.query(`select asin, similarity
      from public.recommend_catalog_products($1, 20, ARRAY['PRI0000001', 'PRI0000002'])`, [users.price])).rows;
    const priceScore = new Map(priceRecommendations.map(row => [row.asin, Number(row.similarity)]));
    assert.ok(priceScore.get('PRI0000004') > priceScore.get('PRI0000003'));

    await addProduct('CAT0000001', axis(3), { priceCents: 3000, category: 'Electronics' });
    await addProduct('CAT0000002', axis(3), { priceCents: 3000, category: 'Electronics' });
    await addProduct('CAT0000003', axis(3), { priceCents: 3000, category: 'Home' });
    assert.equal(await positive(users.category, 'CAT0000001'), true);
    assert.equal(await negative(users.category, 'CAT0000001', 'less_category'), true);

    const categorySignal = (await db.query(`select category, signal_strength, embedding
      from public.user_category_interest_embeddings where user_id = $1`, [users.category])).rows[0];
    assert.equal(categorySignal.category, 'Electronics');
    assert.ok(categorySignal.signal_strength > 0);
    assert.ok(Math.abs(Math.hypot(...JSON.parse(categorySignal.embedding)) - 1) < 1e-6);

    const categoryRecommendations = (await db.query(`select asin, similarity
      from public.recommend_catalog_products($1, 20, ARRAY['CAT0000001'])`, [users.category])).rows;
    const categoryScore = new Map(categoryRecommendations.map(row => [row.asin, Number(row.similarity)]));
    assert.ok(categoryScore.get('CAT0000003') > categoryScore.get('CAT0000002'));
  });

  await t.test('the negative RPC and its state remain inaccessible to API roles', async () => {
    const privileges = (await db.query(`select proname,
      has_function_privilege('anon', oid, 'execute') as anon,
      has_function_privilege('authenticated', oid, 'execute') as authenticated,
      has_function_privilege('service_role', oid, 'execute') as service
      from pg_proc where proname in (
        'record_negative_product_interaction', 'record_retained_product_interaction',
        'record_search_product_interaction', 'search_catalog_products_by_title',
        'recommend_catalog_products'
      ) order by proname`)).rows;
    assert.equal(privileges.length, 5);
    assert.ok(privileges.every(row => !row.anon && !row.authenticated && row.service));
    await db.exec('set role authenticated');
    await assert.rejects(db.query(`select public.record_negative_product_interaction(
      $1, 'NEG0000001', 'skip', 250)`, [users.skips]));
    await assert.rejects(db.query('select * from public.user_skip_interest_embeddings'));
    await db.exec('reset role');
  });
});
