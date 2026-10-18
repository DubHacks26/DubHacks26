const express = require('express');
const Router = express.Router();

const { SIMILARITY_THRESHOLD, LEARNING_RATE } = require('../lib/recommendation-config.cjs');

function catalogClient(req, res) {
  if (req.catalogSupabase) return req.catalogSupabase;
  res.status(503).json({ error: 'The catalog service is not configured.' });
  return null;
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
    .select('asin,main_category,subcategory,bought_in_past_month,badge,last_seen_at')
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
    .select('asin,title,brand,summary,image_url,product_url,price_cents,rating,review_count,categories,hashtags,tags,main_category,subcategory,bought_in_past_month,badge,last_seen_at')
    .order('asin', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('Catalog lookup failed:', error);
    return res.status(503).json({ error: 'The product catalog is temporarily unavailable.' });
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

Router.get('/catalog', handleCatalog);
Router.get('/recommendations', handleRecommendations);
Router.post('/interactions', handleInteraction);

Router.get('/user', async (req, res) => {
  return res.status(200).json({ message: 'User route is working!' });
});

module.exports = { Router, handleCatalog, handleRecommendations, handleInteraction };
