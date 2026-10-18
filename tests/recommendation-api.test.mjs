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
        return name === 'record_positive_product_interaction'
          ? { data: applied, error: null }
          : { data: [{ asin: 'B012345678', title: 'Coffee machine' }], error: null };
      },
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

  request.query = { limit: '10', exclude: 'B000000001' };
  const feed = response();
  await userApi.handleRecommendations(request, feed);
  assert.deepEqual(feed.body, { products: [{ asin: 'B012345678', title: 'Coffee machine' }] });
  assert.deepEqual(calls.at(-1).args, {
    p_user_id: '00000000-0000-0000-0000-000000000001',
    p_limit: 10, p_exclude_asins: ['B000000001'],
  });
});
