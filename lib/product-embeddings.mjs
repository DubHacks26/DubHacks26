import { EMBEDDING_DIMENSIONS, normalizeVector } from './vector.mjs';

let extractorPromise;

export function hashtagsToText(hashtags) {
  if (!Array.isArray(hashtags)) return '';
  return hashtags.filter(tag => typeof tag === 'string')
    .map(tag => tag.trim().replace(/^#+/, '').replace(/_/g, ' ').replace(/\s+/g, ' '))
    .filter(Boolean).join(', ');
}

async function getExtractor() {
  extractorPromise ??= import('@huggingface/transformers')
    .then(({ pipeline }) => pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2'))
    .catch(error => { extractorPromise = undefined; throw error; });
  return extractorPromise;
}

export async function embedHashtags(hashtags) {
  const text = hashtagsToText(hashtags);
  if (!text) return null;
  const extractor = await getExtractor();
  const result = await extractor(text, { pooling: 'mean', normalize: true });
  if (result.data.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions from embedding model`);
  }
  return normalizeVector(result.data);
}

export async function embedCatalogProduct(supabase, product) {
  const embedding = await embedHashtags(product.hashtags);
  if (!embedding) return false;
  const { data, error } = await supabase.rpc('save_catalog_embedding', {
    p_asin: product.asin,
    p_hashtags: product.hashtags,
    p_embedding: `[${embedding.join(',')}]`,
  });
  if (error) throw error;
  return data === true;
}
