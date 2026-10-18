import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { syncHashtagGraph, refreshHashtagGraph, embedPendingHashtags } from '../lib/hashtag-graph.mjs';
import { normalizeVector, dotProduct } from '../lib/vector.mjs';

const axis = index => Array.from({ length: 384 }, (_, i) => i === index ? 1 : 0);
const pair = (first, second) => normalizeVector(axis(0).map((_, i) => i === 0 ? first : i === 1 ? second : 0));

// Exercise the production sync service against real PostgreSQL RPCs, without a
// Supabase account or network. This adapter implements only its used query calls.
function clientFor(db) {
  return {
    from(table) {
      assert.ok(['hashtags', 'catalog_products'].includes(table));
      return {
        async upsert(rows, options) {
          assert.equal(table, 'hashtags');
          assert.deepEqual(options, { onConflict: 'name', ignoreDuplicates: true });
          await db.query('insert into public.hashtags(name) select unnest($1::text[]) on conflict(name) do nothing', [rows.map(row => row.name)]);
          return { error: null };
        },
        select(columns) {
          assert.equal(columns, 'asin, hashtags');
          return { gt(column, cursor) {
            assert.equal(column, 'asin');
            return { order(orderColumn) {
              assert.equal(orderColumn, 'asin');
              return { async limit(limit) {
                return { data: (await db.query('select asin, hashtags from public.catalog_products where asin > $1 order by asin limit $2', [cursor, limit])).rows };
              } };
            } };
          } };
        },
      };
    },
    async rpc(name, args = {}) {
      const parameters = {
        claim_hashtag_embedding: [],
        finish_hashtag_embedding: ['p_id', 'p_token', 'p_embedding'],
        refresh_hashtag_graph: ['p_neighbors', 'p_threshold', 'p_rebuild'],
        get_hashtag_graph: ['p_name', 'p_limit', 'p_link_limit'],
      }[name];
      assert.ok(parameters, name);
      const placeholders = parameters.map((_, i) => `$${i + 1}`).join(',');
      try {
        if (name === 'claim_hashtag_embedding') {
          return { data: (await db.query(`select * from public.${name}()`)).rows };
        }
        return { data: (await db.query(`select public.${name}(${placeholders}) as result`, parameters.map(key => args[key]))).rows[0].result };
      } catch (error) { return { data: null, error }; }
    },
  };
}

test('hashtag SQL migration and synchronization work together', async t => {
  const db = await PGlite.create({ extensions: { vector } });
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    create schema auth; create table auth.users(id uuid primary key);
  `);
  for (const migration of [
    '20261017230000_create_catalog_products.sql',
    '20261017231000_remove_catalog_product_capture_fields.sql',
    '20261017232000_add_catalog_product_hashtags.sql',
    '20261017233000_catalog_recommendations.sql',
    '20261018010000_hashtag_graph.sql',
  ]) await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  const client = clientFor(db);
  const graph = async (name = null, limit = 100, linkLimit = 500) => {
    const result = await client.rpc('get_hashtag_graph', { p_name: name, p_limit: limit, p_link_limit: linkLimit });
    if (result.error) throw result.error;
    return result.data;
  };
  const rows = async table => (await db.query(`select * from public.${table} order by 1,2`)).rows;
  const reset = () => db.exec('truncate public.hashtags cascade; truncate public.catalog_products cascade; update public.hashtag_graph_settings set neighbor_count=8, similarity_threshold=0.65');

  await t.test('empty graph, permissions, and database limits', async () => {
    assert.deepEqual(await graph(), { nodes: [], links: [] });
    const privileges = (await db.query(`select proname,
      has_function_privilege('anon', oid, 'execute') as anon,
      has_function_privilege('authenticated', oid, 'execute') as authenticated,
      has_function_privilege('service_role', oid, 'execute') as service
      from pg_proc where proname in ('claim_hashtag_embedding', 'finish_hashtag_embedding', 'refresh_hashtag_graph', 'get_hashtag_graph')`)).rows;
    assert.equal(privileges.length, 4);
    assert.ok(privileges.every(p => !p.anon && !p.authenticated && p.service));
    await assert.rejects(graph(null, 301));
    await assert.rejects(graph(null, 10, 2001));
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.hashtags'));
    await assert.rejects(db.query('select public.get_hashtag_graph()'));
    await db.exec('reset role');
  });

  await t.test('batch catalog scan, deduplication, unit vectors, sparse selections and reruns', async () => {
    const tags = Array.from({ length: 12 }, (_, i) => `#cluster_${String(i).padStart(2, '0')}`);
    await db.query(`insert into public.catalog_products(asin,title,product_url,captured_at,last_seen_at,hashtags)
      values ('GRAPH00001','fixture','https://example.com',now(),now(),$1)`, [[...tags, '#CLUSTER_00', '#isolated']]);
    await db.exec(`insert into public.catalog_products(asin,title,product_url,captured_at,last_seen_at,hashtags)
      select 'PAGE' || lpad(i::text,6,'0'),'pagination fixture','https://example.com',now(),now(),array['#cluster_00']
      from generate_series(1,101) i`);
    let inferences = 0;
    const embed = async name => { inferences++; return name === 'isolated' ? axis(1) : axis(0); };
    const first = await syncHashtagGraph(client, { embed });
    assert.equal(first.scanned, 102);
    assert.equal(first.embedded, 13);
    const nodes = await rows('hashtags');
    assert.equal(nodes.length, 13);
    assert.ok(nodes.every(h => Math.abs(Math.hypot(...JSON.parse(h.embedding)) - 1) < 1e-6));
    const selections = await rows('hashtag_neighbors');
    const edges = await rows('hashtag_edges');
    assert.equal(selections.length, 12 * 8);
    assert.ok(selections.every(n => n.rank <= 8 && n.similarity >= 0.65 && n.source_id !== n.target_id));
    assert.ok(edges.every(e => e.source_id < e.target_id && e.similarity >= 0.65));
    assert.equal(new Set(edges.map(e => `${e.source_id}/${e.target_id}`)).size, edges.length);
    // Independently compare every source's choices to brute-force cosine top-k.
    for (const source of nodes) {
      const expected = nodes.filter(n => n.id !== source.id).map(n => ({
        id: n.id, similarity: dotProduct(JSON.parse(source.embedding), JSON.parse(n.embedding)),
      })).filter(n => n.similarity >= 0.65).sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id)).slice(0, 8).map(n => n.id);
      assert.deepEqual(selections.filter(n => n.source_id === source.id).sort((a, b) => a.rank - b.rank).map(n => n.target_id), expected);
    }
    const degree = new Map();
    for (const e of edges) for (const id of [e.source_id, e.target_id]) degree.set(id, (degree.get(id) || 0) + 1);
    assert.ok(Math.max(...degree.values()) > 8);
    assert.equal((await graph('isolated')).nodes.length, 1);
    assert.deepEqual((await graph('isolated')).links, []);
    assert.deepEqual(await graph('unknown'), { nodes: [], links: [] });
    const limited = await graph('cluster 00', 4, 2);
    assert.equal(limited.nodes.length, 4);
    assert.equal(limited.nodes[0].name, 'cluster_00');
    assert.equal(limited.links.length, 2);
    assert.ok(limited.links.every(e => limited.nodes.some(n => n.id === e.source) && limited.nodes.some(n => n.id === e.target)));
    assert.equal((await graph(null, 1)).nodes.length, 1);
    assert.equal((await graph(null, 1)).links.length, 0);
    const second = await syncHashtagGraph(client, { embed });
    assert.equal(second.embedded, 0);
    assert.equal(second.refreshed_sources, 0);
    assert.equal(inferences, 13);
    assert.deepEqual(await rows('hashtag_edges'), edges);
    await refreshHashtagGraph(client, { rebuild: true });
    assert.deepEqual(await rows('hashtag_edges'), edges);
    await assert.rejects(db.query('insert into public.hashtag_edges values ($1,$1,1)', [nodes[0].id]));
    await assert.rejects(db.query('insert into public.hashtag_edges values ($1,$2,1)', [edges[0].target_id, edges[0].source_id]));
    await assert.rejects(db.query('insert into public.hashtag_edges values ($1,$2,1)', [edges[0].source_id, edges[0].target_id]));
  });

  await t.test('new hashtags replace existing nearest neighbors and rebuild removes stale edges', async () => {
    await reset();
    const embeddings = { a: pair(1, 0), b: pair(0.8, 0.6), c: pair(0.99, 0.1), isolated: axis(2) };
    const embed = async name => embeddings[name];
    await syncHashtagGraph(client, { products: [{ hashtags: ['#a', '#b', '#isolated'] }], embed });
    const refresh = async (rebuild = false) => {
      const result = await client.rpc('refresh_hashtag_graph', { p_neighbors: 1, p_threshold: 0.65, p_rebuild: rebuild });
      if (result.error) throw result.error;
      return result.data;
    };
    await refresh();
    // Register/embed separately to keep this test's k=1 configuration.
    await client.from('hashtags').upsert([{ name: 'c' }], { onConflict: 'name', ignoreDuplicates: true });
    await embedPendingHashtags(client, { embed });
    const incremental = await refresh();
    assert.equal(incremental.rebuilt, false);
    assert.equal(incremental.refreshed_sources, 3); // the isolated node is untouched
    const nodes = await rows('hashtags');
    const byName = Object.fromEntries(nodes.map(n => [n.name, n.id]));
    const selections = await rows('hashtag_neighbors');
    assert.equal(selections.find(n => n.source_id === byName.a).target_id, byName.c);
    assert.equal(selections.find(n => n.source_id === byName.b).target_id, byName.c);
    const edges = await rows('hashtag_edges');
    assert.equal(edges.length, 2);
    assert.ok(!edges.some(e => [e.source_id, e.target_id].includes(byName.a) && [e.source_id, e.target_id].includes(byName.b)));
    await refresh(true);
    assert.deepEqual(await rows('hashtag_edges'), edges);
    // Inject an obsolete edge and remove a valid selection to test repair.
    const [left, right] = [byName.a, byName.isolated].sort();
    await db.query('insert into public.hashtag_edges values ($1,$2,0.8)', [left, right]);
    await db.query('delete from public.hashtag_neighbors where source_id=$1', [byName.a]);
    await refresh(true);
    assert.deepEqual(await rows('hashtag_edges'), edges);
    const changed = await client.rpc('refresh_hashtag_graph', { p_neighbors: 1, p_threshold: 0.9999, p_rebuild: false });
    assert.equal(changed.data.rebuilt, true);
    assert.deepEqual(await rows('hashtag_edges'), []);
    await db.query('delete from public.hashtags where id=$1', [byName.c]);
    await refresh(true);
    const repaired = await rows('hashtag_edges');
    assert.equal(repaired.length, 1);
    assert.deepEqual([repaired[0].source_id, repaired[0].target_id].sort(), [byName.a, byName.b].sort());
  });

  await t.test('embedding leases prevent duplicate claims and recover from failures/crashes', async () => {
    await reset();
    await client.from('hashtags').upsert([{ name: 'coffee' }], { onConflict: 'name', ignoreDuplicates: true });
    const claim = (await client.rpc('claim_hashtag_embedding')).data[0];
    assert.deepEqual((await client.rpc('claim_hashtag_embedding')).data, []);
    await db.exec("update public.hashtags set claimed_at = now() - interval '16 minutes'");
    const next = (await client.rpc('claim_hashtag_embedding')).data[0];
    assert.notEqual(claim.claim_token, next.claim_token);
    const finish = (token, embedding) => client.rpc('finish_hashtag_embedding', {
      p_id: claim.id, p_token: token, p_embedding: embedding === null ? null : JSON.stringify(embedding),
    });
    assert.equal((await finish(claim.claim_token, axis(0))).data, false);
    assert.ok((await finish(next.claim_token, Array(384).fill(0))).error);
    assert.equal((await finish(next.claim_token, null)).data, true);
    await assert.rejects(embedPendingHashtags(client, { embed: async () => { throw new Error('inference failed'); } }), /inference failed/);
    assert.equal((await rows('hashtags'))[0].claim_token, null);
    assert.equal(await embedPendingHashtags(client, { embed: async () => axis(0) }), 1);
    assert.equal(await embedPendingHashtags(client, { embed: async () => { throw new Error('must not run'); } }), 0);
  });
});
