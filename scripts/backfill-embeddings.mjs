#!/usr/bin/env node

import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { embedCatalogProduct, embedCatalogTitle } from '../lib/product-embeddings.mjs';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set the Supabase URL and server secret key first.');
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const limitArgument = process.argv.indexOf('--limit');
const limit = limitArgument < 0 ? Infinity : Number(process.argv[limitArgument + 1]);
if (limitArgument >= 0 && (!Number.isSafeInteger(limit) || limit < 1)) {
  throw new Error('--limit requires a positive integer.');
}

let cursor = '';
let scanned = 0;
let written = 0;
let hashtagEmbeddings = 0;
let titleEmbeddings = 0;
while (written < limit) {
  const { data, error } = await supabase.from('catalog_products')
    .select('asin, title, hashtags, embedding, title_embedding')
    .or('embedding.is.null,title_embedding.is.null')
    .gt('asin', cursor)
    .order('asin')
    .limit(100);
  if (error) throw error;
  if (!data?.length) break;
  for (const product of data) {
    cursor = product.asin;
    scanned++;
    if (product.embedding === null && Array.isArray(product.hashtags)
        && product.hashtags.length > 0 && written < limit) {
      if (await embedCatalogProduct(supabase, product)) {
        written++;
        hashtagEmbeddings++;
        console.log(`Embedded hashtags for ${product.asin} (${written} written)`);
      }
    }
    if (product.title_embedding === null && written < limit) {
      if (await embedCatalogTitle(supabase, product)) {
        written++;
        titleEmbeddings++;
        console.log(`Embedded title for ${product.asin} (${written} written)`);
      }
    }
    if (written >= limit) break;
  }
}
console.log(`Scanned ${scanned} rows missing embeddings; wrote ${written} (${hashtagEmbeddings} hashtag, ${titleEmbeddings} title).`);
