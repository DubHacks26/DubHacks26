import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

const axis = index => Array.from({ length: 384 }, (_, i) => i === index ? 1 : 0);
const vectorText = value => `[${value.join(',')}]`;

test('title embeddings are independent, invalidated safely, and server-only', async t => {
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
  ]) await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));

  const asin = 'TITLE00001';
  const hashtagVector = axis(0);
  const titleVector = axis(1);
  await db.query(`insert into public.catalog_products
    (asin, title, product_url, captured_at, last_seen_at, hashtags, embedding, title_embedding)
    values ($1, 'Coffee maker', 'https://example.com', now(), now(), ARRAY['#coffee_machine'],
      $2::extensions.vector, $3::extensions.vector)`,
  [asin, vectorText(hashtagVector), vectorText(titleVector)]);

  await t.test('changing only a title invalidates only the title vector', async () => {
    await db.query("update public.catalog_products set title='Espresso maker' where asin=$1", [asin]);
    let row = (await db.query('select embedding, title_embedding from public.catalog_products where asin=$1', [asin])).rows[0];
    assert.deepEqual(JSON.parse(row.embedding), hashtagVector);
    assert.equal(row.title_embedding, null);

    const saved = await db.query(`select public.save_catalog_title_embedding(
      $1, 'Espresso maker', $2::extensions.vector) as saved`, [asin, vectorText(titleVector)]);
    assert.equal(saved.rows[0].saved, true);
    row = (await db.query('select title_embedding from public.catalog_products where asin=$1', [asin])).rows[0];
    assert.deepEqual(JSON.parse(row.title_embedding), titleVector);
  });

  await t.test('changing only hashtags leaves the title vector intact', async () => {
    await db.query("update public.catalog_products set hashtags=ARRAY['#espresso_machine'] where asin=$1", [asin]);
    const row = (await db.query('select embedding, title_embedding from public.catalog_products where asin=$1', [asin])).rows[0];
    assert.equal(row.embedding, null);
    assert.deepEqual(JSON.parse(row.title_embedding), titleVector);
  });

  await t.test('saving validates normalization and rejects delayed stale work', async () => {
    await db.query("update public.catalog_products set title='Automatic espresso maker' where asin=$1", [asin]);
    await assert.rejects(db.query(`select public.save_catalog_title_embedding(
      $1, 'Automatic espresso maker', $2::extensions.vector)`, [asin, vectorText(Array(384).fill(0))]));
    const stale = await db.query(`select public.save_catalog_title_embedding(
      $1, 'Espresso maker', $2::extensions.vector) as saved`, [asin, vectorText(titleVector)]);
    assert.equal(stale.rows[0].saved, false);
    const saved = await db.query(`select public.save_catalog_title_embedding(
      $1, 'Automatic espresso maker', $2::extensions.vector) as saved`, [asin, vectorText(axis(2))]);
    assert.equal(saved.rows[0].saved, true);
  });

  await t.test('all privileged embedding and recommendation functions exclude API roles', async () => {
    const privileges = (await db.query(`select proname,
      has_function_privilege('anon', oid, 'execute') as anon,
      has_function_privilege('authenticated', oid, 'execute') as authenticated,
      has_function_privilege('service_role', oid, 'execute') as service
      from pg_proc where proname in (
        'save_catalog_embedding', 'save_catalog_title_embedding',
        'record_positive_product_interaction', 'recommend_catalog_products'
      )`)).rows;
    assert.equal(privileges.length, 4);
    assert.ok(privileges.every(row => !row.anon && !row.authenticated && row.service));
    await db.exec('set role anon');
    await assert.rejects(db.query(`select public.save_catalog_title_embedding(
      $1, 'Automatic espresso maker', $2::extensions.vector)`, [asin, vectorText(axis(2))]));
    await db.exec('reset role');
  });
});
