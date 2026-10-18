const express = require('express');
const config = require('../lib/hashtag-graph-config.cjs');
const { normalizeHashtag } = require('../lib/hashtag-names.cjs');
const Router = express.Router();

function boundedInteger(value, fallback, max) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number <= max ? number : null;
}

async function handleGraph(req, res) {
  const limit = boundedInteger(req.query.limit, config.DEFAULT_NODE_LIMIT, config.MAX_NODE_LIMIT);
  const linkLimit = boundedInteger(req.query.linkLimit, config.DEFAULT_LINK_LIMIT, config.MAX_LINK_LIMIT);
  const rawName = req.query.hashtag;
  if (limit === null || linkLimit === null || (rawName !== undefined &&
      (typeof rawName !== 'string' || rawName.length > 512 || !normalizeHashtag(rawName)))) {
    return res.status(400).json({ error: 'Provide a valid hashtag, limit (1–300), and linkLimit (1–2000).' });
  }
  if (!req.catalogSupabase) return res.status(503).json({ error: 'The catalog service is not configured.' });
  try {
    const { data, error } = await req.catalogSupabase.rpc('get_hashtag_graph', {
      p_name: rawName === undefined ? null : normalizeHashtag(rawName),
      p_limit: limit, p_link_limit: linkLimit,
    });
    if (error) throw error;
    return res.json(data || { nodes: [], links: [] });
  } catch (error) {
    console.error('Hashtag graph lookup failed:', error);
    return res.status(503).json({ error: 'The hashtag graph is temporarily unavailable.' });
  }
}

Router.get('/graph', handleGraph);
module.exports = { Router, handleGraph };
