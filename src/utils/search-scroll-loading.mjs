import { normalizeCatalogProduct } from "./catalogProduct.mjs";

const DETAIL_BATCH_SIZE = 8;

/**
 * Search already supplies everything a card needs. Publish those cards first,
 * then add ranking/detail metadata without waiting for the whole catalog batch.
 */
export async function loadSearchScrollProducts(matches, {
  loadDetails,
  onProducts,
  isActive = () => true,
  batchSize = DETAIL_BATCH_SIZE,
}) {
  const rows = [];
  const rowIds = new Set();
  for (const match of Array.isArray(matches) ? matches : []) {
    if (!match || typeof match !== "object") continue;
    const id = match.asin || match.id;
    if (typeof id !== "string" || !id || rowIds.has(id)) continue;
    rowIds.add(id);
    rows.push(match);
  }

  let products = rows.map(normalizeCatalogProduct);
  if (!isActive()) return products;
  onProducts(products);

  const asins = rows.map(row => row.asin || row.id)
    .filter(asin => /^[A-Z0-9]{10}$/.test(asin));
  const size = Number.isInteger(batchSize) && batchSize > 0 ? batchSize : DETAIL_BATCH_SIZE;
  for (let from = 0; from < asins.length; from += size) {
    if (!isActive()) break;
    const batch = asins.slice(from, from + size);
    let details;
    try {
      details = await loadDetails(batch);
    } catch {
      // Optional metadata must never hide otherwise usable search results.
      continue;
    }
    if (!isActive()) break;

    const batchIds = new Set(batch);
    const detailsByAsin = new Map((Array.isArray(details) ? details : [])
      .filter(detail => detail && batchIds.has(detail.asin))
      .map(detail => [detail.asin, detail]));
    if (!detailsByAsin.size) continue;

    products = products.map((product, index) => {
      const match = rows[index];
      const detail = detailsByAsin.get(match.asin || match.id);
      if (!detail) return product;
      return normalizeCatalogProduct({
        ...match,
        ...detail,
        // Hydration cannot change a search match's identity or relevance score.
        asin: match.asin || match.id,
        similarity: match.similarity,
      });
    });
    onProducts(products);
  }
  return products;
}
