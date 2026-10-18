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

## Personalized feed

The personalized feed reads products from `catalog_products` and saves each
account's preferences and product actions in Supabase. Before using it, apply
the migrations to the linked project:

```bash
npm run supabase:push
```

The feed migration adds the category fields and creates the per-user preference
and interaction tables with row-level security. Product actions and their
derived seen state are retained across sign-ins and used to rank the feed.

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

Apply the pending Supabase migrations with `npm run supabase:push` before using
the recommendation API. `20261017233000_catalog_recommendations.sql` adds the
hashtag-list embedding and five-slot user interests; the later
`20261018040000_catalog_title_embeddings.sql` adds the independent title
embedding. The live catalog has hashtags in `catalog_products`; the older
`products` table is not used for semantic recommendations.

`catalog_products.embedding` contains the embedding of the generated hashtag
list, while `catalog_products.title_embedding` independently contains the
embedding of the product title. Both use `Xenova/all-MiniLM-L6-v2`, mean
pooling, and L2 normalization. Separate triggers clear only the affected vector
when hashtags or a title change, so a delayed worker cannot save a stale value.
The recommender uses the hashtag-list vector for hashtag affinity and the
separate title vector for semantic title affinity. The title-affinity signal
compares each candidate with interacted product titles using cosine similarity,
scaled from neutral at 0.2 to full similarity at 0.7 for the current MiniLM
model. Like/save events reinforce similar meanings, while skips and negative
feedback demote them. Title vectors are loaded for catalog candidates and
interaction history. Titles without vectors are omitted from that feature, and
the other personal signals are renormalized.

The search overlay embeds a submitted query with the same model and retrieves
the closest products by title meaning. Queries must pass basic quality checks
and have a title similarity of at least 0.25 before they can guide
recommendations. A valid submitted search nudges the closest existing hashtag
interest by a 0.03 learning rate, at most once per normalized query per day;
if there is no existing interest, it initializes the first one from that
product. Query text itself is not stored. Live typing previews matches but
does not change recommendations until the user submits the search.

`npm run generate:hashtags` embeds each updated hashtag list and fills a missing
title vector for that catalog row. To fill either missing vector after the
migration or after direct database edits, run:

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
- `POST /user/interactions` accepts `like`, `save`, `skip`, `too_expensive`,
  and `less_category`. A skip may include an integer `dwellMs`; requests use
  the authenticated user ID and are idempotent per product/action.
- `GET /user/search?query=...` returns title-semantic matches without changing
  preferences; `POST /user/search` performs the same search and weakly learns
  from its closest confident result.

Search results can be opened as a dedicated search scroll at
`/search/scroll?query=...`. That feed contains only the semantic matches for
the query; likes, skips, and dwell time update the same preference model as
the regular feed. As feedback arrives, only unseen matches are re-ranked, and
the in-feed button returns to the regular personalized Scroll.

The Discover and Scroll experiences call these routes. The feed ranks products
using four personal signals—main category (10%), subcategory (20%), hashtags
(35%), and semantic title similarity (35%)—then blends that score with soft
price fit (15%), smoothed review quality (12%), and popularity (8%), including
best-seller badges and recent purchase counts. Missing catalog signals are
omitted and the available weights are renormalized. Price is not a hard cutoff.
Onboarding and feed preferences use the catalog's 18 populated `main_category`
labels; legacy broad selections such as Home or Electronics remain supported.

Hashtag matching combines direct interaction history with the existing
384-dimensional hashtag embedding similarity when vectors are available.
Semantic title matching uses separate 384-dimensional title embeddings and
cosine similarity, scaled from neutral at 0.2 to full similarity at 0.7. Likes
and saves reinforce titles with similar meanings; skips and negative feedback
demote them. Vectors are loaded for catalog products and interaction history;
missing title vectors are omitted and available personal signals are
renormalized.

Product actions are saved per account in `product_interactions`; preferences
are saved in `user_feed_preferences`. Likes and saves update the separate
five-slot positive interest model. Negative signals stay in separate
database-side avoidance models, so they do not pull positive vectors away from
a user's tastes:

- A skip before two seconds is a small avoidance signal. Views from two to
  five seconds are neutral, and views longer than five seconds give a small
  positive retention signal to the closest existing interest, or start one if
  there is no positive interest yet.
- “Too expensive” creates up to five semantic price contexts. It only lowers
  related products at or above the learned price ceiling, preserving cheaper
  alternatives.
- “I don't like this” records an avoided main category and embedding. It
  lowers that category broadly, with the largest reduction for related items.

Each negative action is idempotent per product/action, uses the same per-user
advisory lock as positive updates, and is ignored gracefully if the product has
no hashtag embedding. The penalty settings, quick-skip threshold, and learning
rates live in the server-only `recommendation_negative_settings` table. The
normal feed's direct feedback rules remain in place and continue to decay with
a 30-day half-life.
Already-seen products remain eligible, but their client-side feed score is
reduced by 80%. This keeps fresh products ahead while allowing a particularly
strong match to return when the catalog is small.

Run `npm run supabase:push` to apply any pending local migration, including
`20261018060000_semantic_search_and_retention.sql`, which adds semantic search,
weak search and retention learning, and the revised quick-skip strength. Run
`npm run backfill:embeddings` to populate missing catalog embeddings. Products
without a valid title vector do not contribute title-specific ranking evidence.

Interest similarity and learning rate live in
`lib/recommendation-config.cjs`.

Run `npm test` for vector, real-model, and route tests. After applying the
migration, `RUN_DB_INTEGRATION_TESTS=1 npm test` also exercises concurrent
updates, duplicate events, missing embeddings, fallback, and deduplicated
recommendations against Supabase using temporary test users and products.

## Semantic hashtag graph (backend only)

Apply `supabase/migrations/20261018010000_hashtag_graph.sql` after the catalog
recommendation migration. It adds four tables:

- `hashtags`: stable UUID, unique canonical name, independent normalized 384D
  embedding, and resumable embedding/graph work state.
- `hashtag_neighbors`: each node's directed nearest-neighbor selections.
- `hashtag_edges`: the undirected union of those selections, with canonical
  endpoint order, foreign keys, and cosine similarity weights.
- `hashtag_graph_settings`: the settings used by the last graph update.

All tables and RPCs are restricted to the server role. Graph endpoints use the
existing Express authentication middleware. No vectors or model outputs beyond
similarity scores are returned to the browser.

### Synchronization

With the Supabase URL and server secret configured in `.env.local` (or exported
environment variables), run:

```bash
npm run supabase:push
npm run sync:hashtag-graph
# Repair all selections/edges, retaining IDs and already computed embeddings:
npm run sync:hashtag-graph -- --rebuild
```

Run sync after importing/generating product hashtags, or from your job scheduler.
It is an explicit background/batch operation; imports and feed requests do not
automatically launch it. The command pages through `catalog_products.hashtags`,
deduplicates normalized names, and embeds only missing names. For an incremental
import job that already knows its changed products, use
`syncHashtagGraph(db, { products: changedProducts })` from `lib/hashtag-graph.mjs`.
`registerProductHashtags` can also register work without doing model inference.

Normalization removes leading `#`, turns underscores into spaces, collapses
whitespace, trims, and lowercases: `#Coffee_Machine` becomes `coffee machine`.
Each name is embedded individually using the existing shared Transformers.js
model instance (`Xenova/all-MiniLM-L6-v2`). Product and user vectors are unchanged.
Names/IDs are retained if products stop using a hashtag; rebuild repairs edges
but does not delete historical hashtags or regenerate embeddings.

The default graph uses **8** nearest neighbors and a **0.65** minimum cosine
similarity, configured in `lib/hashtag-graph-config.cjs`. A node's final undirected
degree may exceed eight when other nodes select it. Incremental refresh examines
new vectors against existing selection boundaries, then recomputes only affected
sources and incident edges. A settings change automatically forces a rebuild.
Ties use stable UUID ordering. Rebuild also removes obsolete/orphan selections
and repairs missing edges. A failed transaction leaves the previous graph intact.

Database leases prevent duplicate embedding work between concurrent sync workers.
Caught errors release a lease and fail the command; after a crash, an unfinished
claim becomes available again in 15 minutes. Rerunning resumes missing embeddings
and pending graph work. Graph writes are serialized separately from recommendation
updates. The first model use may download model files and needs internet access.

Similarity search uses exact pgvector queries in PostgreSQL; no pairwise matrix
is built in Node. Full rebuilds still have quadratic distance-comparison cost,
so run them off the request path. For much larger vocabularies, profile and
consider HNSW with its approximate-neighbor tradeoff; this implementation favors
exact, reproducible neighbor selections.

### API

`GET /hashtags/graph` requires a Bearer Supabase access token. Query parameters:

| Parameter | Default | Meaning |
| --- | --- | --- |
| `hashtag` | omitted | Exact normalized name; selects that node and its strongest direct neighbors. |
| `limit` | 100 | Maximum nodes, including the seed; integer 1–300. |
| `linkLimit` | 500 | Maximum links; integer 1–2000. |

Without a seed, nodes are selected alphabetically. Links are the strongest
stored edges whose endpoints are both in the selected nodes. Isolated embedded
hashtags are included. An unknown/unembedded seed or empty graph returns
`{"nodes":[],"links":[]}`. Invalid parameters return 400; database failures return
503. Limits bound both SQL results and response size. No coordinates or embedding
inference are computed by this endpoint.

```bash
curl --get 'http://localhost:5000/hashtags/graph' \
  --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  --data-urlencode 'hashtag=#coffee_machine' \
  --data-urlencode 'limit=30' \
  --data-urlencode 'linkLimit=100'
```

The response is `{ nodes: [{ id, name }], links: [{ source, target, similarity }] }`.
IDs are UUID strings, display names use underscores, and every link references
returned nodes. The frontend can use these IDs directly with `3d-force-graph`.
No frontend visualization or recommendation changes are included.

### Graph tests

`npm test` includes real-model semantic checks and an isolated PGlite/PostgreSQL
database with pgvector. The two PGlite packages are development-only dependencies;
these graph database tests require no Supabase credentials and touch no live data.
They execute the actual migrations and sync service, covering pagination,
deduplication, incremental neighbor replacement, top-k limits, undirected edges,
thresholds, deterministic rebuilds, repair, leases, permissions, and bounded API
queries. PGlite is single-connection; production multi-connection load/lock timing
is not benchmarked by this suite.
