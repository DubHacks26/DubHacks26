const express = require('express');
const config = require('../lib/hashtag-graph-config.cjs');
const { normalizeHashtag } = require('../lib/hashtag-names.cjs');
const Router = express.Router();
const VECTOR_DIMENSIONS = 384;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    return res.status(400).json({ error: 'Provide a valid hashtag, limit (1–500), and linkLimit (1–2000).' });
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

function parseVector(value) {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  if (!Array.isArray(parsed) || parsed.length !== VECTOR_DIMENSIONS) return null;
  const vector = parsed.map(value => typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() ? Number(value) : NaN);
  if (!vector.every(Number.isFinite)) return null;
  const norm = Math.hypot(...vector);
  return norm > 0 ? { vector, norm } : null;
}

function cosineSimilarity(left, right) {
  let dot = 0;
  for (let index = 0; index < VECTOR_DIMENSIONS; index++) {
    dot += left.vector[index] * right.vector[index];
  }
  return Math.max(-1, Math.min(1, dot / (left.norm * right.norm)));
}

async function handleAlignment(req, res) {
  const requestedIds = req.body?.nodeIds;
  if (!Array.isArray(requestedIds) || requestedIds.length < 1 || requestedIds.length > 500
      || requestedIds.some(id => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
    return res.status(400).json({ error: 'Provide between 1 and 500 valid hashtag node IDs.' });
  }
  if (!req.user?.id) return res.status(401).json({ error: 'A signed-in user is required.' });
  if (!req.catalogSupabase) return res.status(503).json({ error: 'The catalog service is not configured.' });

  const client = req.catalogSupabase;
  try {
    const [interestsResult, hashtagsResult] = await Promise.all([
      client.from('user_interest_embeddings').select('embedding').eq('user_id', req.user.id).limit(5),
      client.from('hashtags').select('id,embedding').in('id', [...new Set(requestedIds)]),
    ]);
    if (interestsResult.error) throw interestsResult.error;
    if (hashtagsResult.error) throw hashtagsResult.error;

    const interests = (interestsResult.data || []).map(row => parseVector(row.embedding)).filter(Boolean);
    const embeddings = new Map((hashtagsResult.data || []).map(row => [row.id, parseVector(row.embedding)]));
    const scores = {};
    for (const id of requestedIds) {
      const nodeVector = embeddings.get(id);
      if (!nodeVector || !interests.length) {
        scores[id] = null;
        continue;
      }
      scores[id] = Math.max(...interests.map(interest => cosineSimilarity(nodeVector, interest)));
    }
    return res.json({ hasInterests: interests.length > 0, scores });
  } catch (error) {
    console.error('Taste map alignment lookup failed:', error);
    return res.status(503).json({ error: 'Taste alignment is temporarily unavailable.' });
  }
}

Router.get('/graph', handleGraph);
Router.post('/alignment', handleAlignment);
module.exports = { Router, handleGraph, handleAlignment };
