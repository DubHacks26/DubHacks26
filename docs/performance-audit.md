# Performance audit — October 18, 2026

Scope: local source review, production compilation, automated tests, and a synthetic Node ranking benchmark. No authenticated browser trace or deployed Core Web Vitals measurements were collected. Timings below are CPU measurements, not page-load or interaction latency claims.

## Findings and changes

| Priority | Finding | Change |
| --- | --- | --- |
| High | Every shop page mounted its own authentication/profile/app shell, repeating session restoration, interaction history reads, history product reads, and recommendation loading on navigation. | Moved shop routes into a shared `(shop)` layout. URLs stay the same; shell state survives tab navigation. |
| High | Every shell render rebuilt product maps and ranked both the visible feed and the search feed. Toasts, dialogs, and cart updates repeated this work. | Memoized normalized products and ranking; derive the visible feed by filtering the shared ranking. Added an equivalence regression test. |
| High | Catalog rendering waited for recommendations through `Promise.all`; recommendation failure also emptied the usable catalog. | Load each independently. Catalog errors remain visible; recommendation failures retain existing usable products. |
| High | Likes and saves updated the visible profile only after both persistence and semantic-learning requests completed. | Update the profile immediately after persistence succeeds. Refresh recommendations again when learning completes. The initial database write still gates visible feedback. |
| Medium | Feedback reran the combined catalog/recommendation effect; after a manual refresh, each subsequent event forced another catalog network request. | Separate catalog refresh from feedback and debounce recommendation refreshes by 400 ms. |
| Medium | All secondary tabs and dialogs were eagerly imported. | Dynamically import secondary screens and dialogs. First opening can incur a chunk download. |

## Benchmark

Synthetic dataset: 100 normalized products, 500 feedback events, 50 seen products, three hashtags per product; 30 iterations after warmup on this machine.

- Previous two-ranking path: **115.6 ms** per iteration.
- Shared-ranking plus seen-filter path: **79.5 ms** per iteration, about **31% less CPU time**.
- Unrelated shell state changes now reuse the memoized ranking, so they do not execute this ranking path at all.

This benchmark does not establish production INP or account for actual account histories, network latency, mobile CPU, or image decoding.

## Remaining bottlenecks

1. **Ranking still scales with products × interaction history.** A 79 ms synthetic ranking remains a main-thread long-task risk. Aggregate feedback features once per profile revision, cache per-event recency/token computations, or move scoring to a worker. Validate scoring equivalence before changing recommendation behavior.
2. **Initial profile restoration reads the full interaction history**, then fetches history products in sequential batches of 100 before showing the app. Shared layouts remove repeated navigation costs, but first visits still pay this cost. Consider persisted profile aggregates and bounded parallel history fetches.
3. **Product images explicitly bypass Next image optimization.** Large original images may dominate network/decode cost. Measure actual source dimensions and bytes before choosing responsive image sizes and optimizer/cache settings.
4. **Scroll delays are partly deliberate:** the reel transition is 550 ms, wheel cooldown 650 ms, swipe exit 380 ms, with another 620 ms exit-state guard. Test shorter transitions against trackpad momentum and accidental multi-swipes before changing them.
5. **Server requests have sequential network stages:** authentication calls Supabase `getUser`, then recommendation RPC and metadata lookup. Measure stage timings under real traffic before changing verification or query behavior.
6. **Feedback still waits for the durable database write.** Optimistic updates with rollback, per-product ordering, and undo reconciliation would remove this remaining network wait. Success notifications and undo registration for positive actions still wait for semantic learning.

## Validation and limits

- Production build succeeds for all existing URLs, including dynamic collections.
- ESLint passes for the changed components, routes, and regression test.
- Full original suite: 39 passed, one failed, one skipped. The existing failure is `repeated too-expensive feedback lowers the learned soft price ceiling`; neither its scoring implementation nor its original assertion was changed. The database recommendation integration test requires explicit opt-in and was skipped.
- Latest full suite after concurrent semantic-feedback/API changes: **43 passed, two failed, one skipped**. The additional failure is `backend routes validate actions and use the authenticated user ID`: the test expects an empty result for null similarity, while the concurrently modified API retains that product. These concurrent changes were preserved.
- Added regression test verifies that filtering the shared ranking preserves the unseen feed order.
- Follow up with an authenticated production browser trace: navigate Home → Scroll → Collections → Cart, like/save/skip, open dialogs, and measure request counts, long tasks, INP, and image transfer sizes on desktop and throttled mobile. Confirm tab navigation no longer reloads account history.
