import { EMBEDDING_DIMENSIONS, normalizeVector } from './vector.mjs';

let extractorPromise;

export function hashtagsToText(hashtags) {
  if (!Array.isArray(hashtags)) return '';
  return hashtags.filter(tag => typeof tag === 'string')
    .map(tag => tag.trim().replace(/^#+/, '').replace(/_/g, ' ').replace(/\s+/g, ' '))
    .filter(Boolean).join(', ');
}

export function titleToText(title) {
  return typeof title === 'string' ? title.trim().replace(/\s+/g, ' ') : '';
}

async function getExtractor() {
  extractorPromise ??= import('@huggingface/transformers')
    .then(({ pipeline }) => pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2'))
    .catch(error => { extractorPromise = undefined; throw error; });
  return extractorPromise;
}

export async function embedHashtags(hashtags) {
  const text = hashtagsToText(hashtags);
  return embedText(text);
}

export async function embedTitle(title) {
  return embedText(titleToText(title));
}

// Shared model instance for product lists and individual hashtag meanings.
export async function embedText(text) {
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

export async function embedCatalogTitle(supabase, product) {
  const embedding = await embedTitle(product.title);
  if (!embedding) return false;
  const { data, error } = await supabase.rpc('save_catalog_title_embedding', {
    p_asin: product.asin,
    p_title: product.title,
    p_embedding: `[${embedding.join(',')}]`,
  });
  if (error) throw error;
  return data === true;
}
