# Demo feed and product integration

Discover and Profile share a “Tune my feed” panel. Onboarding uses the same vocabulary and fields. The controls include price range and six categories: Electronics, Gaming, Fashion, Home, Beauty, and Education. Categories boost ranking without hiding other products; only price range limits eligibility. Style/color metadata remains available internally for future data integration, but is not shown as a preference control.

Right-swipe, right-arrow, and the heart mean Like. Likes affect ranking; bookmarks alone change the wishlist. Left-swipe/arrow skips a product. Feedback lowers the rank of shared styles, the same category, or products at/above a rejected price. It never silently changes the user's filters. Undo restores the last feed action while preserving later bookmarks. Revisit resets seen products while keeping likes, feedback, and saves.

State is saved under `shopscroller:profile:v1:<Supabase user ID>` in this browser's localStorage. It is account-scoped, not synchronized between devices. The model separates `likes`, `saved`, `skips`, `feedback`, and `seen` for later database/recommendation integration. Clear browser storage to reset the demo profile completely.

## Replacing the demo catalog

`src/utils/shopScrollerData.js` currently exports products after passing each record through `normalizeProduct` from `src/utils/feed.mjs`. Replace the source at that boundary, and keep one shared catalog for Discover, Collections, Budget, and Search. A live API will also need loading/error handling and pagination; this change prepares the product shape rather than providing an API connection.

Example input:

```js
{
  id: "product_123", // stable, globally unique; keep the ID type consistent
  name: "Ceramic table lamp",
  brand: "Hearth & Form",
  price: 42, // numeric USD
  category: "home",
  imageUrl: "https://example.com/lamp.jpg",
  hashtags: ["#minimalism", "#warm_tones"],
  styles: ["minimalist"],
  colors: ["neutral"],
  rating: 4.7,
  reviews: 684,
  description: "Warm light for a quieter corner."
}
```

Normalization removes hash prefixes and merges aliases into a shared vocabulary. Known styles/colors become filterable fields; unknown tags remain available as metadata/search text. Visible chips use category and an honest price bracket. Missing or failed images use `/product-placeholder.svg`. Extend the alias map when real data introduces new terminology; do not derive recommendations from unverified image content.

Explanations come from actual shared likes or explicit preferences; generic exploration is labeled accordingly. No fabricated match percentages are shown on feed cards.

Run the behavior checks with `node --test tests/feed.test.mjs`.
