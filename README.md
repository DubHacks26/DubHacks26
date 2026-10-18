This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Importing a product capture

The sample capture can be imported as an idempotent product catalog. Add a
`SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) to `.env.local`
(never prefix it with `NEXT_PUBLIC_`), then run:

```bash
npm run import:sample-capture
```

That command applies the Supabase migrations and imports `sample capture.jsonl`.
The importer keys products by ASIN and leaves an existing product unchanged;
repeated ASINs in the same file are also skipped. Validate a file without
writing any data with:

```bash
npm run import:capture -- --dry-run
```

## Generating local-LLM hashtags

The catalog has a separate `hashtags` column for LLM-generated discovery tags;
the source-capture `tags` column is left unchanged. Start a chat/instruct model
and the local server in LM Studio's **Developer** tab. The script uses LM
Studio's OpenAI-compatible API at `http://127.0.0.1:1234/v1` by default and
uses structured JSON output so malformed model prose never reaches the
database.

Optionally set these server-only values in `.env.local`:

```bash
# Only needed if LM Studio is not at its default address or model auto-detection is unwanted.
LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1
LMSTUDIO_MODEL=your-loaded-model-id
# LMSTUDIO_API_TOKEN=only-if-you-configured-one
```

Apply the migration, import the captures, and populate missing hashtag lists:

```bash
npm run enrich:sample-capture
```

For a new capture file, import it first and then generate tags:

```bash
npm run supabase:push
npm run import:capture -- captures/latest.jsonl
npm run generate:hashtags -- captures/latest.jsonl
```

To apply hashtags that are already present in a capture JSONL, back up the
current database rows first, then update only the `hashtags` column:

```bash
npm run backup:hashtags -- backups/before-hashtag-import.jsonl
npm run import:hashtags -- captures/latest.jsonl --dry-run
npm run import:hashtags -- captures/latest.jsonl
```

The backup includes complete catalog rows whose `hashtags` array is non-empty.
The hashtag importer validates 5–20 lowercase ASCII tags per record, checks
that every ASIN already exists, and never overwrites other product columns.

The generator is resumable: it skips rows whose `hashtags` array is already
populated. Test model output without writes with `--dry-run`, regenerate all
rows with `--force`, or process a small sample with `--limit 10`.

## Backend product recommendations

Apply `supabase/migrations/20261017233000_catalog_recommendations.sql` with
`npm run supabase:push` before using the recommendation API. This migration
adds pgvector embeddings to the existing `catalog_products` table and creates
five-slot user interests and idempotent positive interactions. The live
catalog has hashtags in `catalog_products`; the older `products` table is not
used for semantic recommendations.

`npm run generate:hashtags` now embeds each updated hashtag list on the backend
with `Xenova/all-MiniLM-L6-v2`. A database trigger clears an embedding if its
hashtags change, so stale vectors cannot be recommended. To fill missing
vectors after the migration or after direct database edits, run:

```bash
npm run backfill:embeddings
# Or try a small batch first:
npm run backfill:embeddings -- --limit 10
```

The model downloads on first use and is reused within the process. The scripts
and Express server use `SUPABASE_SECRET_KEY` (or
`SUPABASE_SERVICE_ROLE_KEY`) only on the backend. Keep
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the
server key configured for `npm run dev` or `npm start`.

Authenticated Express routes (Bearer Supabase access token):

- `GET /user/recommendations?limit=20&exclude=ASIN1,ASIN2` returns an
  interleaved, deduplicated catalog batch. New users get the newest products.
- `POST /user/interactions` with `{"asin":"B012345678","action":"like"}`
  (or `"save"`) updates one interest atomically. Repeated positive events for
  the same product are ignored, and products without embeddings are skipped.

The UI remains unchanged; it can call these routes when the catalog feed is
connected. Interest similarity and learning rate live in
`lib/recommendation-config.cjs`.

Run `npm test` for vector, real-model, and route tests. After applying the
migration, `RUN_DB_INTEGRATION_TESTS=1 npm test` also exercises concurrent
updates, duplicate events, missing embeddings, fallback, and deduplicated
recommendations against Supabase using temporary test users and products.
