#!/usr/bin/env node
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { syncHashtagGraph } from '../lib/hashtag-graph.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: npm run sync:hashtag-graph -- [--rebuild]\nScans the catalog, embeds only missing hashtags, and updates affected neighbors.\n--rebuild repairs all neighbor selections and edges without regenerating embeddings.');
} else {
  try {
    if (args.some(arg => arg !== '--rebuild')) throw new Error('Only --rebuild and --help are supported.');
    nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Set the Supabase URL and server secret key first.');
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    console.log(await syncHashtagGraph(db, {
      rebuild: args.includes('--rebuild'),
      onProgress: (name, count) => console.log(`Embedded ${name} (${count})`),
    }));
  } catch (error) {
    console.error(`Hashtag graph sync failed: ${error.message}`);
    process.exitCode = 1;
  }
}
