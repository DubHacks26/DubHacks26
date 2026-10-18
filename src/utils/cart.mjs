const asinPattern = /^[A-Z0-9]{10}$/;

function amazonProductUrl(product, asin) {
  if (asinPattern.test(asin)) return `https://www.amazon.com/dp/${asin}`;
  const candidate = product.amazonUrl || product.productUrl;
  if (typeof candidate !== "string") return null;
  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    if (hostname === "amazon.com" || hostname.endsWith(".amazon.com")) return url.href;
  } catch {
    return null;
  }
  return null;
}

export function toCartItem(product) {
  if (!product || typeof product !== "object") return null;
  const id = String(product.asin || product.id || "");
  const price = product.price;
  if (!id || typeof product.name !== "string" || !product.name.trim()
      || price === null || price === undefined || price === ""
      || !Number.isFinite(Number(price)) || Number(price) < 0) return null;
  const asin = String(product.asin || (asinPattern.test(id) ? id : ""));
  const amazonUrl = amazonProductUrl(product, asin);
  if (!amazonUrl) return null;
  return {
    id,
    asin: asin || null,
    name: product.name.trim(),
    brand: typeof product.brand === "string" ? product.brand : "",
    image: typeof product.image === "string" ? product.image : "",
    price: Number(price),
    amazonUrl,
  };
}

export function restoreCart(items) {
  if (!Array.isArray(items)) return [];
  const uniqueItems = new Map();
  for (const item of items) {
    const normalized = toCartItem(item);
    if (normalized && !uniqueItems.has(normalized.id)) {
      uniqueItems.set(normalized.id, normalized);
    }
  }
  return [...uniqueItems.values()];
}

export function cartTotal(items) {
  return items.reduce((total, item) => total + item.price, 0);
}
