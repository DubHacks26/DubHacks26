import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { normalizeVector, updateInterests } from '../lib/vector.mjs';

const axis = index => Array.from({ length: 384 }, (_, i) => i === index ? 1 : 0);
const user = '00000000-0000-0000-0000-000000000001';

test('novel likes adapt full interest slots faster in the database', async t => {
  const db = await PGlite.create({ extensions: { vector } });
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  `);
  for (const migration of [
    '20261017230000_create_catalog_products.sql',
    '20261017231000_remove_catalog_product_capture_fields.sql',
    '20261017232000_add_catalog_product_hashtags.sql',
    '20261017233000_catalog_recommendations.sql',
    '20261018080000_novel_interest_learning.sql',
  ]) await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  await db.query('insert into auth.users(id) values ($1)', [user]);

  const novel = normalizeVector(axis(0).map((value, i) => value * 0.1 + (i === 5 ? 1 : 0)));
  const similar = normalizeVector(axis(0).map((value, i) => value + (i === 5 ? 0.1 : 0)));
  for (const scenario of [
    { name: 'novel like at capacity uses 0.5', count: 5, product: novel, action: 'like' },
    { name: 'novel save at capacity retains 0.1', count: 5, product: novel, action: 'save' },
    { name: 'similar like at capacity retains 0.1', count: 5, product: similar, action: 'like' },
    { name: 'novel like with room creates a slot', count: 4, product: novel, action: 'like' },
    { name: 'opposite vectors stay normalized', count: 5, product: axis(0).map(x => -x), action: 'like', opposite: true },
  ]) await t.test(scenario.name, async () => {
    await db.exec('delete from public.positive_product_interactions; delete from public.user_interest_embeddings; delete from public.catalog_products;');
    const interests = Array.from({ length: scenario.count }, (_, slotIndex) => ({
      slotIndex, embedding: axis(scenario.opposite ? 0 : slotIndex),
    }));
    for (const interest of interests) await db.query(`insert into public.user_interest_embeddings
      (user_id, slot_index, embedding) values ($1, $2, $3::extensions.vector)`,
    [user, interest.slotIndex, JSON.stringify(interest.embedding)]);
    await db.query(`insert into public.catalog_products
      (asin, title, product_url, captured_at, last_seen_at, hashtags, embedding)
      values ('NOVEL00001', 'New interest', 'https://example.com', now(), now(), ARRAY['novel'], $1::extensions.vector)`,
    [JSON.stringify(scenario.product)]);
    const apply = () => db.query(`select public.record_positive_product_interaction(
      $1, 'NOVEL00001', $2, 0.65, 0.1) as applied`, [user, scenario.action]);
    assert.equal((await apply()).rows[0].applied, true);
    const read = async () => (await db.query(`select slot_index, embedding from public.user_interest_embeddings
      where user_id = $1 order by slot_index`, [user])).rows;
    const rows = await read();
    const expected = updateInterests(interests, scenario.product, 0.65, scenario.action);
    assert.equal(rows.length, expected.length);
    rows.forEach((row, index) => {
      assert.equal(row.slot_index, expected[index].slotIndex);
      const actual = JSON.parse(row.embedding);
      assert.ok(Math.abs(Math.hypot(...actual) - 1) < 1e-6);
      actual.forEach((value, dimension) => assert.ok(Math.abs(value - expected[index].embedding[dimension]) < 1e-6));
    });
    assert.equal((await apply()).rows[0].applied, false);
    assert.deepEqual(await read(), rows, 'retry must not nudge the vector twice');
  });

  const privileges = (await db.query(`select
    has_function_privilege('anon', oid, 'execute') as anon,
    has_function_privilege('authenticated', oid, 'execute') as authenticated,
    has_function_privilege('service_role', oid, 'execute') as service
    from pg_proc where proname = 'record_positive_product_interaction'`)).rows;
  assert.deepEqual(privileges, [{ anon: false, authenticated: false, service: true }]);
});
