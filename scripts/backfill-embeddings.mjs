#!/usr/bin/env node

import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { embedCatalogProduct } from '../lib/product-embeddings.mjs';

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
while (written < limit) {
  const { data, error } = await supabase.from('catalog_products')
    .select('asin, hashtags')
    .is('embedding', null)
    .gt('asin', cursor)
    .order('asin')
    .limit(100);
  if (error) throw error;
  if (!data?.length) break;
  for (const product of data) {
    cursor = product.asin;
    scanned++;
    if (!Array.isArray(product.hashtags) || product.hashtags.length === 0) continue;
    if (await embedCatalogProduct(supabase, product)) {
      written++;
      console.log(`Embedded ${product.asin} (${written} written)`);
    }
    if (written >= limit) break;
  }
}
console.log(`Scanned ${scanned} missing vectors; wrote ${written}.`);
