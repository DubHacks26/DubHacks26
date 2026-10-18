import config from './hashtag-graph-config.cjs';
import names from './hashtag-names.cjs';
import { embedHashtag } from './hashtag-embeddings.mjs';
import { normalizeVector } from './vector.mjs';

function checked({ data, error }) {
  if (error) throw error;
  return data;
}

// Can also be called by an import/background job with just its changed products.
// Registration performs no inference and never overwrites an existing vector.
export async function registerProductHashtags(db, products) {
  const unique = names.uniqueHashtagNames(products);
  for (let offset = 0; offset < unique.length; offset += 100) {
    checked(await db.from('hashtags').upsert(
      unique.slice(offset, offset + 100).map(name => ({ name })),
      { onConflict: 'name', ignoreDuplicates: true },
    ));
  }
  return unique.length;
}

export async function registerCatalogHashtags(db) {
  let cursor = '';
  let scanned = 0;
  while (true) {
    const products = checked(await db.from('catalog_products').select('asin, hashtags')
      .gt('asin', cursor).order('asin').limit(100));
    if (!products?.length) return scanned;
    await registerProductHashtags(db, products);
    scanned += products.length;
    cursor = products.at(-1).asin;
  }
}

export async function embedPendingHashtags(db, { embed = embedHashtag, onProgress = () => {} } = {}) {
  let embedded = 0;
  while (true) {
    // A lease prevents overlapping workers from inferring the same tag. A crash
    // leaves it retryable after 15 minutes; a caught failure releases it now.
    const claimed = checked(await db.rpc('claim_hashtag_embedding'));
    const tag = claimed?.[0];
    if (!tag) return embedded;
    try {
      const vector = normalizeVector(await embed(tag.name));
      const saved = checked(await db.rpc('finish_hashtag_embedding', {
        p_id: tag.id, p_token: tag.claim_token, p_embedding: JSON.stringify(vector),
      }));
      if (saved) {
        embedded++;
        onProgress(tag.name, embedded);
      }
    } catch (error) {
      // Preserve the original inference/write error even if releasing also fails.
      try {
        checked(await db.rpc('finish_hashtag_embedding', {
          p_id: tag.id, p_token: tag.claim_token, p_embedding: null,
        }));
      } catch { /* The lease will expire. */ }
      throw error;
    }
  }
}

export async function refreshHashtagGraph(db, { rebuild = false } = {}) {
  return checked(await db.rpc('refresh_hashtag_graph', {
    p_neighbors: config.NEIGHBOR_COUNT,
    p_threshold: config.SIMILARITY_THRESHOLD,
    p_rebuild: rebuild,
  }));
}

export async function syncHashtagGraph(db, { products, rebuild = false, ...embeddingOptions } = {}) {
  let scanned;
  if (products === undefined) {
    scanned = await registerCatalogHashtags(db);
  } else {
    await registerProductHashtags(db, products);
    scanned = products.length;
  }
  const embedded = await embedPendingHashtags(db, embeddingOptions);
  const graph = await refreshHashtagGraph(db, { rebuild });
  return { scanned, embedded, ...graph };
}
