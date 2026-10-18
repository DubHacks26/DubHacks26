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
The importer keys products by ASIN, so re-running it updates existing products
instead of creating duplicates. Validate a file without writing any data with:

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

The generator is resumable: it skips rows whose `hashtags` array is already
populated. Test model output without writes with `--dry-run`, regenerate all
rows with `--force`, or process a small sample with `--limit 10`.
