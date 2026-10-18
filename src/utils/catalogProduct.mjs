import { normalizeProduct } from "./feed.mjs";

const categoryRules = [
  ["Gaming", /\b(gaming|xbox|playstation|nintendo|steam deck|controller|racing wheel)\b/i],
  ["Beauty", /\b(beauty|skincare|skin care|makeup|cosmetic|serum|moisturizer|hair care)\b/i],
  ["Fashion", /\b(fashion|apparel|clothing|sneaker|shoe|sunglasses|jacket|dress|handbag|jewelry)\b/i],
  ["Electronics", /\b(tech|electronics?|headphones?|earbuds?|speaker|camera|phone|computer|keyboard|mouse|smart home)\b/i],
  ["Education", /\b(book|reading|education|learning|puzzle|craft|toy|board game|hobby|school)\b/i],
  ["Home", /\b(home|kitchen|furniture|decor|lamp|storage|bedding|bath|outdoor|fitness|yoga)\b/i],
];

function list(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === "string" && item.trim()) : [];
}

function secureHttpsUrl(value, allowedHost) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    if (allowedHost && url.hostname !== allowedHost && !url.hostname.endsWith(`.${allowedHost}`)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function inferCategory(row, tags) {
  const source = [
    ...list(row.categories), row.main_category, row.subcategory, row.title,
    row.summary, ...tags,
  ].filter(Boolean).join(" ").replace(/[_#-]+/g, " ");
  return categoryRules.find(([, pattern]) => pattern.test(source))?.[0] || "Home";
}

export function normalizeCatalogProduct(row) {
  const hashtags = [...list(row?.hashtags), ...list(row?.tags)];
  const title = typeof row?.title === "string" && row.title.trim()
    ? row.title.trim()
    : "Untitled find";
  const rawPrice = row?.price_cents == null ? NaN : Number(row.price_cents);
  const price = Number.isInteger(rawPrice) && rawPrice >= 0 ? rawPrice / 100 : null;
  const rawRating = row?.rating == null ? NaN : Number(row.rating);
  const rating = Number.isFinite(rawRating) && rawRating >= 0 && rawRating <= 5 ? rawRating : null;
  const rawReviews = row?.review_count == null ? NaN : Number(row.review_count);
  const reviews = Number.isInteger(rawReviews) && rawReviews >= 0 ? rawReviews : 0;
  const retailerUrl = secureHttpsUrl(row?.product_url, "amazon.com");

  return normalizeProduct({
    ...row,
    id: row?.asin || row?.id || title,
    asin: row?.asin || undefined,
    name: title,
    brand: typeof row?.brand === "string" && row.brand.trim() ? row.brand.trim() : "Independent brand",
    price,
    category: inferCategory(row || {}, hashtags),
    rating,
    reviews,
    image: secureHttpsUrl(row?.image_url || row?.imageUrl || row?.image) || "/product-placeholder.svg",
    description: typeof row?.summary === "string" && row.summary.trim()
      ? row.summary.trim()
      : "A new find from the ShopScroll catalog.",
    productUrl: retailerUrl,
    tags: hashtags,
  });
}

export function formatProductPrice(price) {
  if (!Number.isFinite(price)) return "Price unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(price);
}
