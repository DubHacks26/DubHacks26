import test from 'node:test';
import assert from 'node:assert/strict';
import userApi from '../api/user.js';
import config from '../lib/recommendation-config.cjs';

function response() {
  return {
    code: 200, body: undefined,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('backend routes validate actions and use the authenticated user ID', async () => {
  const calls = [];
  let applied = true;
  const request = {
    user: { id: '00000000-0000-0000-0000-000000000001' },
    body: {}, query: {},
    catalogSupabase: {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return [
          'record_positive_product_interaction',
          'record_negative_product_interaction',
          'record_retained_product_interaction',
        ].includes(name)
          ? { data: applied, error: null }
          : { data: [{ asin: 'B012345678', title: 'Coffee machine', similarity: 0.82 }], error: null };
      },
      from: name => ({
        select: columns => {
          const query = {
            in: async (column, values) => {
              calls.push({ name, columns, column, values });
              return {
                data: [{ asin: 'B012345678', title_embedding: '[0.1,0.2]', main_category: 'Home & kitchen', subcategory: 'Coffee makers' }],
                error: null,
              };
            },
            order(column, options) {
              calls.push({ name, columns, orderColumn: column, orderOptions: options });
              return query;
            },
            limit: async limit => {
              calls.push({ name, columns, limit });
              return { data: [{ asin: 'B012345678', title: 'Coffee machine' }], error: null };
            },
          };
          return query;
        },
      }),
    },
  };

  request.body = { asin: 'bad', action: 'view' };
  const invalid = response();
  await userApi.handleInteraction(request, invalid);
  assert.equal(invalid.code, 400);
  assert.equal(calls.length, 0);

  request.body = { asin: 'B012345678', action: 'like', user_id: 'spoofed' };
  const first = response();
  await userApi.handleInteraction(request, first);
  assert.deepEqual(first.body, { applied: true });
  assert.deepEqual(calls[0], {
    name: 'record_positive_product_interaction',
    args: {
      p_user_id: '00000000-0000-0000-0000-000000000001',
      p_asin: 'B012345678', p_action: 'like',
      p_threshold: config.SIMILARITY_THRESHOLD,
      p_learning_rate: config.LEARNING_RATE,
    },
  });

  applied = false;
  const duplicate = response();
  await userApi.handleInteraction(request, duplicate);
  assert.deepEqual(duplicate.body, { applied: false });

  request.body = { asin: 'B012345678', action: 'skip', dwellMs: 250, user_id: 'spoofed' };
  applied = true;
  const negative = response();
  await userApi.handleInteraction(request, negative);
  assert.deepEqual(negative.body, { applied: true });
  assert.deepEqual(calls.at(-1), {
    name: 'record_negative_product_interaction',
    args: {
      p_user_id: '00000000-0000-0000-0000-000000000001',
      p_asin: 'B012345678',
      p_action: 'skip',
      p_dwell_ms: 250,
    },
  });

  request.body = { asin: 'B012345678', action: 'too_expensive' };
  const price = response();
  await userApi.handleInteraction(request, price);
  assert.deepEqual(price.body, { applied: true });
  assert.deepEqual(calls.at(-1), {
    name: 'record_negative_product_interaction',
    args: {
      p_user_id: '00000000-0000-0000-0000-000000000001',
      p_asin: 'B012345678',
      p_action: 'too_expensive',
      p_dwell_ms: null,
    },
  });

  request.body = { asin: 'B012345678', action: 'less_category' };
  const category = response();
  await userApi.handleInteraction(request, category);
  assert.deepEqual(category.body, { applied: true });
  assert.equal(calls.at(-1).name, 'record_negative_product_interaction');
  assert.equal(calls.at(-1).args.p_action, 'less_category');

  request.body = { asin: 'B012345678', action: 'skip', dwellMs: -1 };
  const invalidDwell = response();
  const callsBeforeInvalidDwell = calls.length;
  await userApi.handleInteraction(request, invalidDwell);
  assert.equal(invalidDwell.code, 400);
  assert.equal(calls.length, callsBeforeInvalidDwell);

  request.body = { asin: 'B012345678', action: 'skip', dwellMs: 2000 };
  const neutralView = response();
  await userApi.handleInteraction(request, neutralView);
  assert.deepEqual(neutralView.body, { applied: true, learning: 'neutral' });
  assert.equal(calls.length, callsBeforeInvalidDwell);

  request.body = { asin: 'B012345678', action: 'skip', dwellMs: 5000 };
  const lastNeutralView = response();
  await userApi.handleInteraction(request, lastNeutralView);
  assert.deepEqual(lastNeutralView.body, { applied: true, learning: 'neutral' });
  assert.equal(calls.length, callsBeforeInvalidDwell);

  request.body = { asin: 'B012345678', action: 'skip', dwellMs: 5001 };
  applied = true;
  const retainedView = response();
  await userApi.handleInteraction(request, retainedView);
  assert.deepEqual(retainedView.body, { applied: true });
  assert.deepEqual(calls.at(-1), {
    name: 'record_retained_product_interaction',
    args: {
      p_user_id: '00000000-0000-0000-0000-000000000001',
      p_asin: 'B012345678',
      p_dwell_ms: 5001,
    },
  });

  request.query = { limit: '10', exclude: 'B000000001' };
  const feed = response();
  await userApi.handleRecommendations(request, feed);
  assert.deepEqual(feed.body, {
    products: [{
      asin: 'B012345678',
      title: 'Coffee machine',
      similarity: 0.82,
      title_embedding: '[0.1,0.2]',
      main_category: 'Home & kitchen',
      subcategory: 'Coffee makers',
    }],
  });
  assert.deepEqual(calls.filter(call => call.args?.p_limit === 10).at(-1).args, {
    p_user_id: '00000000-0000-0000-0000-000000000001',
    p_limit: 10, p_exclude_asins: ['B000000001'],
  });
  assert.deepEqual(calls.at(-1), {
    name: 'catalog_products',
    columns: 'asin,title_embedding,main_category,subcategory,bought_in_past_month,badge,last_seen_at',
    column: 'asin',
    values: ['B012345678'],
  });

  const fallbackRequest = {
    ...request,
    catalogSupabase: {
      ...request.catalogSupabase,
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: [{ asin: 'B012345678', similarity: null }], error: null };
      },
    },
  };
  const fallback = response();
  const callCountBeforeFallback = calls.length;
  await userApi.handleRecommendations(fallbackRequest, fallback);
  assert.deepEqual(fallback.body, {
    products: [{
      asin: 'B012345678',
      title_embedding: '[0.1,0.2]',
      similarity: null,
      main_category: 'Home & kitchen',
      subcategory: 'Coffee makers',
    }],
  });
  assert.equal(calls.length, callCountBeforeFallback + 2);

  const catalog = response();
  await userApi.handleCatalog(request, catalog);
  assert.deepEqual(catalog.body.products.map(product => product.asin), ['B012345678']);
  assert.ok(calls.some(call => call.orderColumn === 'asin' && call.orderOptions.ascending));
  assert.ok(calls.some(call => call.limit === 10));
  assert.ok(calls.some(call => call.columns?.includes('title_embedding')));
});

test('semantic search rejects gibberish and learns only from confident submitted searches', async () => {
  const calls = [];
  let embedCalls = 0;
  const request = {
    method: 'GET',
    user: { id: '00000000-0000-0000-0000-000000000001' },
    query: { query: 'fdsfadsfa' },
    body: {},
    catalogSupabase: {
      rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === 'search_catalog_products_by_title') {
          return {
            data: [
              { asin: 'B012345678', title: 'Noise cancelling headphones', similarity: 0.72 },
              { asin: 'B000000001', title: 'Bluetooth headphones', similarity: 0.61 },
              { asin: 'B000000002', title: 'Unrelated product', similarity: 0.18 },
            ],
            error: null,
          };
        }
        return { data: true, error: null };
      },
    },
  };
  const embed = async () => {
    embedCalls += 1;
    return Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0);
  };

  const gibberish = response();
  await userApi.handleSemanticSearch(request, gibberish, embed);
  assert.deepEqual(gibberish.body, { products: [], valid: false, learned: false });
  assert.equal(embedCalls, 0);
  assert.equal(calls.length, 0);

  request.query.query = 'wireless headphones';
  const preview = response();
  await userApi.handleSemanticSearch(request, preview, embed);
  assert.equal(preview.body.valid, true);
  assert.equal(preview.body.learned, false);
  assert.deepEqual(preview.body.products.map(product => product.asin), [
    'B012345678',
    'B000000001',
  ]);
  assert.equal(calls.length, 1);

  request.method = 'POST';
  request.body = { query: 'wireless headphones' };
  const submitted = response();
  await userApi.handleSemanticSearch(request, submitted, embed);
  assert.equal(submitted.body.learned, true);
  assert.equal(calls.at(-1).name, 'record_search_product_interaction');
  assert.equal(calls.at(-1).args.p_asin, 'B012345678');
  assert.match(calls.at(-1).args.p_query_key, /^[0-9a-f]{64}$/);
});

test('history product route validates ASIN batches and reads through the server catalog client', async () => {
  const calls = [];
  const request = {
    user: { id: '00000000-0000-0000-0000-000000000001' },
    query: { asins: 'B012345678,B000000001,B012345678' },
    catalogSupabase: {
      from: name => ({
        select: columns => ({
          in: async (column, values) => {
            calls.push({ name, columns, column, values });
            return {
              data: [{
                asin: 'B012345678',
                title: 'Coffee machine',
                title_embedding: `[${Array(384).fill(0).map((_, index) => index === 0 ? 1 : 0).join(',')}]`,
              }],
              error: null,
            };
          },
        }),
      }),
    },
  };
  const result = response();
  await userApi.handleHistoryProducts(request, result);
  assert.equal(result.code, 200);
  assert.equal(result.body.products[0].asin, 'B012345678');
  assert.ok(calls[0].columns.includes('title_embedding'));
  assert.deepEqual(calls[0].values, ['B012345678', 'B000000001']);

  request.query = { asins: 'invalid' };
  const invalid = response();
  await userApi.handleHistoryProducts(request, invalid);
  assert.equal(invalid.code, 400);
  assert.equal(calls.length, 1);

  request.query = {
    asins: Array.from({ length: 101 }, (_, index) =>
      `B${String(index).padStart(9, '0')}`).join(','),
  };
  const tooMany = response();
  await userApi.handleHistoryProducts(request, tooMany);
  assert.equal(tooMany.code, 400);
  assert.equal(calls.length, 1);
});
