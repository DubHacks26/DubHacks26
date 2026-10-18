const express = require('express');
const Router = express.Router();
const { createHash } = require('node:crypto');

const { SIMILARITY_THRESHOLD, LEARNING_RATE } = require('../lib/recommendation-config.cjs');
const QUICK_SKIP_DWELL_MS = 2000;
const NEUTRAL_SKIP_DWELL_MS = 5000;
const MIN_SEARCH_SIMILARITY = 0.25;

function catalogClient(req, res) {
  if (req.catalogSupabase) return req.catalogSupabase;
  res.status(503).json({ error: 'The catalog service is not configured.' });
  return null;
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function handleFriendSearch(req, res) {
  const prefix = typeof req.query.query === 'string' ? req.query.query.trim().toLowerCase() : '';
  if (prefix.length < 2 || prefix.length > 24 || !/^[a-z0-9_]+$/.test(prefix)) {
    return res.status(400).json({ error: 'Enter at least two letters, numbers, or underscores to search usernames.' });
  }
  const client = catalogClient(req, res);
  if (!client) return;
  const { data, error } = await client.rpc('search_account_usernames', {
    p_prefix: prefix,
    p_user_id: req.user.id,
    p_limit: 20,
  });
  if (error) {
    console.error('Friend account search failed:', error);
    return res.status(503).json({ error: 'Account search is temporarily unavailable. Apply the friends migration if it has not been run.' });
  }
  return res.json({
    users: (data || []).map(user => ({
      userId: user.user_id,
      username: user.username,
      relationship: user.relationship,
    })),
  });
}

async function handleFriendData(req, res) {
  const client = catalogClient(req, res);
  if (!client) return;
  const { data, error } = await client.rpc('get_friend_data', {
    p_user_id: req.user.id,
  });
  if (error) {
    console.error('Friend data lookup failed:', error);
    return res.status(503).json({ error: 'Friends are temporarily unavailable. Apply the friends migration if it has not been run.' });
  }
  return res.json(data || {
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    shares: [],
  });
}

async function handleFriendRequest(req, res) {
  const friendId = req.body?.friendId;
  if (!isUuid(friendId) || friendId === req.user.id) {
    return res.status(400).json({ error: 'Choose a valid user to add.' });
  }
  const client = catalogClient(req, res);
  if (!client) return;
  const { data, error } = await client.rpc('create_friend_request', {
    p_sender_id: req.user.id,
    p_recipient_id: friendId,
  });
  if (error) {
    console.error('Friend request creation failed:', error);
    return res.status(503).json({ error: 'The friend request could not be sent.' });
  }
  if (data === 'not_found') return res.status(404).json({ error: 'That account could not be found.' });
  return res.json({ status: data });
}

async function handleFriendResponse(req, res) {
  const { friendId, accept } = req.body || {};
  if (!isUuid(friendId) || friendId === req.user.id || typeof accept !== 'boolean') {
    return res.status(400).json({ error: 'Provide a valid friend request and response.' });
  }
  const client = catalogClient(req, res);
  if (!client) return;
  const { data, error } = await client.rpc('respond_friend_request', {
    p_user_id: req.user.id,
    p_friend_id: friendId,
    p_accept: accept,
  });
  if (error) {
    console.error('Friend request response failed:', error);
    return res.status(503).json({ error: 'The friend request could not be updated.' });
  }
  if (data !== true) return res.status(404).json({ error: 'That pending friend request could not be found.' });
  return res.json({ accepted: accept });
}

async function handleFriendRemoval(req, res) {
  const friendId = req.params.friendId;
  if (!isUuid(friendId) || friendId === req.user.id) {
    return res.status(400).json({ error: 'Choose a valid friend to remove.' });
  }
  const client = catalogClient(req, res);
  if (!client) return;
  const { data, error } = await client.rpc('remove_friendship', {
    p_user_id: req.user.id,
    p_friend_id: friendId,
  });
  if (error) {
    console.error('Friend removal failed:', error);
    return res.status(503).json({ error: 'The friend could not be removed.' });
  }
  if (data !== true) return res.status(404).json({ error: 'That friend was not found.' });
  return res.json({ removed: true });
}

async function handleProductShare(req, res) {
  const { friendId, asin } = req.body || {};
  if (!isUuid(friendId) || friendId === req.user.id
      || typeof asin !== 'string' || !/^[A-Z0-9]{10}$/.test(asin)) {
    return res.status(400).json({ error: 'Choose an accepted friend and a valid catalog product.' });
  }
  const client = catalogClient(req, res);
  if (!client) return;
  const { data, error } = await client.rpc('share_product_with_friend', {
    p_sender_id: req.user.id,
    p_recipient_id: friendId,
    p_asin: asin,
  });
  if (error) {
    console.error('Product share failed:', error);
    const message = error.message || '';
    if (message.includes('accepted friend')) {
      return res.status(403).json({ error: 'You can share products only with accepted friends.' });
    }
    if (message.includes('Product not found')) {
      return res.status(404).json({ error: 'That product could not be found in the catalog.' });
    }
    return res.status(503).json({ error: 'The product could not be shared.' });
  }
  return res.status(201).json({ shareId: data });
}

async function handleRecommendations(req, res) {
  const client = catalogClient(req, res);
  if (!client) return;
  const limit = Number(req.query.limit || 20);
  const exclude = typeof req.query.exclude === 'string'
    ? req.query.exclude.split(',').filter(asin => /^[A-Z0-9]{10}$/.test(asin)).slice(0, 500)
    : [];
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: 'Limit must be between 1 and 100.' });
  }
  const { data, error } = await client.rpc('recommend_catalog_products', {
    p_user_id: req.user.id, p_limit: limit, p_exclude_asins: exclude,
  });
  if (error) {
    console.error('Recommendation lookup failed:', error);
    return res.status(503).json({ error: 'Recommendations are temporarily unavailable.' });
  }
  // Cold-start rows deliberately have a neutral similarity. Keep a null value
  // too for compatibility with a database that has not yet applied the latest
  // recommendation migration.
  const candidates = data || [];
  if (!candidates.length) return res.json({ products: [] });
  const { data: details, error: detailsError } = await client.from('catalog_products')
    .select('asin,title_embedding,main_category,subcategory,bought_in_past_month,badge,last_seen_at')
    .in('asin', candidates.map(product => product.asin));
  if (detailsError) {
    console.error('Recommendation metadata lookup failed:', detailsError);
    return res.status(503).json({ error: 'Recommendation details are temporarily unavailable.' });
  }
  const detailsByAsin = new Map((details || []).map(product => [product.asin, product]));
  return res.json({
    products: candidates.map(product => ({
      ...product,
      ...detailsByAsin.get(product.asin),
    })),
  });
}

async function handleCatalog(req, res) {
  const client = catalogClient(req, res);
  if (!client) return;
  const limit = Number(req.query.limit ?? 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: 'Limit must be between 1 and 100.' });
  }
  const { data, error } = await client.from('catalog_products')
    .select('asin,title,title_embedding,brand,summary,image_url,product_url,price_cents,rating,review_count,categories,hashtags,tags,main_category,subcategory,bought_in_past_month,badge,last_seen_at')
    .order('asin', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('Catalog lookup failed:', error);
    return res.status(503).json({ error: 'The product catalog is temporarily unavailable.' });
  }
  return res.json({ products: data || [] });
}

async function handleHistoryProducts(req, res) {
  const client = catalogClient(req, res);
  if (!client) return;
  const rawAsins = req.query.asins;
  if (typeof rawAsins !== 'string' || !rawAsins.trim()) {
    return res.status(400).json({ error: 'Provide one or more catalog ASINs.' });
  }
  const asins = [...new Set(rawAsins.split(',').map(asin => asin.trim()))];
  if (asins.length > 100 || asins.some(asin => !/^[A-Z0-9]{10}$/.test(asin))) {
    return res.status(400).json({ error: 'Provide up to 100 valid catalog ASINs.' });
  }
  const { data, error } = await client.from('catalog_products')
    .select('asin,title,title_embedding,brand,summary,image_url,product_url,price_cents,rating,review_count,availability,hashtags,main_category,subcategory,bought_in_past_month')
    .in('asin', asins);
  if (error) {
    console.error('Interaction history product lookup failed:', error);
    return res.status(503).json({ error: 'Saved product details are temporarily unavailable.' });
  }
  return res.json({ products: data || [] });
}

async function handleInteraction(req, res) {
  const client = catalogClient(req, res);
  if (!client) return;
  const { asin, action, dwellMs } = req.body || {};
  const positive = ['like', 'save'].includes(action);
  const negative = ['skip', 'too_expensive', 'less_category'].includes(action);
  const hasDwell = dwellMs !== undefined && dwellMs !== null;
  if (typeof asin !== 'string' || !/^[A-Z0-9]{10}$/.test(asin) || (!positive && !negative)
      || (action === 'skip' && hasDwell
        && (!Number.isInteger(dwellMs) || dwellMs < 0 || dwellMs > 3600000))
      || (action !== 'skip' && hasDwell)) {
    return res.status(400).json({
      error: 'Provide a catalog ASIN and a supported semantic action. Skip duration must be a whole number of milliseconds.',
    });
  }
  if (action === 'skip' && hasDwell
      && dwellMs >= QUICK_SKIP_DWELL_MS && dwellMs <= NEUTRAL_SKIP_DWELL_MS) {
    return res.json({ applied: true, learning: 'neutral' });
  }
  const rpc = positive
    ? {
        name: 'record_positive_product_interaction',
        args: {
          p_user_id: req.user.id,
          p_asin: asin,
          p_action: action,
          p_threshold: SIMILARITY_THRESHOLD,
          p_learning_rate: LEARNING_RATE,
        },
      }
    : action === 'skip' && hasDwell && dwellMs > NEUTRAL_SKIP_DWELL_MS
      ? {
          name: 'record_retained_product_interaction',
          args: {
            p_user_id: req.user.id,
            p_asin: asin,
            p_dwell_ms: dwellMs,
          },
        }
      : {
        name: 'record_negative_product_interaction',
        args: {
          p_user_id: req.user.id,
          p_asin: asin,
          p_action: action,
          p_dwell_ms: action === 'skip' && hasDwell ? dwellMs : null,
        },
      };
  const { data, error } = await client.rpc(rpc.name, rpc.args);
  if (error) {
    console.error('Semantic interaction update failed:', error);
    return res.status(503).json({ error: 'The interaction could not update recommendations.' });
  }
  return res.json({ applied: data === true });
}

function isReasonableSearch(query) {
  if (typeof query !== 'string') return false;
  const trimmed = query.trim();
  if (!trimmed || trimmed.length > 120 || /(.)\1{4,}/i.test(trimmed)) return false;
  const tokens = trimmed.match(/[a-z0-9]+/gi) || [];
  if (tokens.length > 12) return false;
  const letters = trimmed.replace(/[^a-z]/gi, '');
  if (letters.length < 2) return false;
  const vowelLessWords = new Set(['rhythm', 'strength', 'strengths', 'crypt', 'gypsy', 'syzygy']);
  return !tokens.some((token) =>
    /^[a-z]+$/i.test(token)
    && token.length >= 7
    && (token.match(/[aeiouy]/gi) || []).length / token.length < 0.25
    && !vowelLessWords.has(token.toLowerCase()),
  );
}

async function handleSemanticSearch(req, res, embedQuery) {
  const rawQuery = req.method === 'POST' ? req.body?.query : req.query.query;
  if (!isReasonableSearch(rawQuery)) {
    return res.json({ products: [], valid: false, learned: false });
  }
  const query = rawQuery.trim().replace(/\s+/g, ' ');
  try {
    const embed = embedQuery || (await import('../lib/product-embeddings.mjs')).embedText;
    const embedding = await embed(query);
    if (!Array.isArray(embedding) || embedding.length !== 384
        || !embedding.every(Number.isFinite)) {
      throw new Error('The semantic search embedding is unavailable or invalid.');
    }
    const client = catalogClient(req, res);
    if (!client) return;
    const { data, error } = await client.rpc('search_catalog_products_by_title', {
      p_query: `[${embedding.join(',')}]`,
      p_limit: 20,
    });
    if (error) {
      console.error('Semantic product search failed:', error);
      return res.status(503).json({ error: 'Semantic search is temporarily unavailable.' });
    }
    const matches = (data || []).filter(product =>
      Number.isFinite(Number(product.similarity))
      && Number(product.similarity) >= MIN_SEARCH_SIMILARITY,
    );
    let learned = false;
    if (req.method === 'POST' && matches.length) {
      const queryKey = createHash('sha256')
        .update(`${query.toLowerCase()}:${new Date().toISOString().slice(0, 10)}`)
        .digest('hex');
      const { data: applied, error: learningError } = await client.rpc(
        'record_search_product_interaction',
        {
          p_user_id: req.user.id,
          p_asin: matches[0].asin,
          p_query_key: queryKey,
        },
      );
      if (learningError) {
        console.error('Search preference update failed:', learningError);
        return res.status(503).json({ error: 'Search results loaded, but the preference could not be updated.' });
      }
      learned = applied === true;
    }
    return res.json({
      products: matches,
      valid: matches.length > 0,
      learned,
    });
  } catch (error) {
    console.error('Semantic search embedding failed:', error);
    return res.status(503).json({ error: 'Semantic search is temporarily unavailable.' });
  }
}

Router.get('/catalog', handleCatalog);
Router.get('/history-products', handleHistoryProducts);
Router.get('/recommendations', handleRecommendations);
Router.get('/friends/search', handleFriendSearch);
Router.get('/friends', handleFriendData);
Router.post('/friends/requests', handleFriendRequest);
Router.patch('/friends/requests', handleFriendResponse);
Router.delete('/friends/:friendId', handleFriendRemoval);
Router.post('/friends/shares', handleProductShare);
Router.get('/search', (req, res) => handleSemanticSearch(req, res));
Router.post('/search', (req, res) => handleSemanticSearch(req, res));
Router.post('/interactions', handleInteraction);

Router.get('/user', async (req, res) => {
  return res.status(200).json({ message: 'User route is working!' });
});

module.exports = {
  Router,
  handleCatalog,
  handleHistoryProducts,
  handleRecommendations,
  handleInteraction,
  handleSemanticSearch,
  handleFriendSearch,
  handleFriendData,
  handleFriendRequest,
  handleFriendResponse,
  handleFriendRemoval,
  handleProductShare,
};
