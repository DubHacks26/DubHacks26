// Shared vocabulary: incoming hashtags map to these canonical values.
export const categories = ['Electronics', 'Gaming', 'Fashion', 'Home', 'Beauty', 'Education'];
export const styles = ['minimalist', 'sustainable', 'practical', 'aesthetic', 'premium', 'budget-friendly'];
export const colors = ['neutral', 'white', 'black', 'pink', 'green', 'blue'];
const aliases = { minimalism: 'minimalist', minimal: 'minimalist', technology: 'electronics', tech: 'electronics', books: 'education', kitchen: 'home', 'home-decor': 'home', 'food-&-kitchen': 'kitchen', 'warm-tones': 'neutral', neutrals: 'neutral', functional: 'practical' };
export function normalizeTag(value) {
  const tag = String(value).trim().toLowerCase().replace(/^#+/, '').replace(/[\s_]+/g, '-');
  return aliases[tag] || tag;
}
export function normalizeProduct(raw) {
  const tags = [...new Set([...(raw.tags || []), ...(raw.hashtags || [])].map(normalizeTag))];
  const category = categories.find(c => normalizeTag(c) === normalizeTag(raw.category)) || 'Home';
  return { ...raw, category, image: raw.imageUrl || raw.image || '/product-placeholder.svg', tags,
    styles: [...new Set([...(raw.styles || []), ...tags].map(normalizeTag).filter(t => styles.includes(t)))],
    colors: [...new Set([...(raw.colors || []), ...tags].map(normalizeTag).filter(t => colors.includes(t)))] };
}
export const defaultPreferences = { categories: [], minPrice: 0, maxPrice: 300 };
export function createProfile() {
  return { preferences: { ...defaultPreferences }, likes: [], saved: [], skips: [], feedback: [], seen: [], onboarded: false };
}
export function restoreProfile(raw) {
  const result = createProfile();
  if (!raw || typeof raw !== 'object') return result;
  for (const key of ['likes', 'saved', 'skips', 'seen']) if (Array.isArray(raw[key])) result[key] = [...new Set(raw[key].filter(id => typeof id === 'string' || typeof id === 'number'))];
  if (Array.isArray(raw.feedback)) result.feedback = raw.feedback.filter(f => f && ['style', 'price', 'category'].includes(f.reason) && f.productId != null);
  const p = raw.preferences || {};
  result.preferences.categories = Array.isArray(p.categories) ? [...new Set(p.categories.map(value => categories.find(c => normalizeTag(c) === normalizeTag(value))).filter(Boolean))] : [];
  if (Number.isFinite(p.minPrice) && p.minPrice >= 0) result.preferences.minPrice = p.minPrice;
  if (Number.isFinite(p.maxPrice) && p.maxPrice >= result.preferences.minPrice) result.preferences.maxPrice = p.maxPrice;
  result.preferences.maxPrice = Math.max(result.preferences.minPrice, result.preferences.maxPrice);
  result.onboarded = raw.onboarded === true;
  return result;
}
export function matches(product, p) {
  return product.price >= p.minPrice && product.price <= p.maxPrice;
}
export function score(product, profile, catalog) {
  let value = 0;
  const p = profile.preferences;
  if (p.categories.includes(product.category)) value += 6;
  for (const liked of catalog.filter(p => profile.likes.includes(p.id))) {
    if (liked.category === product.category) value += 3;
    value += product.styles.filter(s => liked.styles.includes(s)).length * 2;
  }
  for (const feedback of profile.feedback) {
    const source = catalog.find(p => p.id === feedback.productId);
    if (!source) continue;
    if (feedback.reason === 'category' && source.category === product.category) value -= 5;
    if (feedback.reason === 'style') value -= product.styles.filter(s => source.styles.includes(s)).length * 4;
    if (feedback.reason === 'price' && product.price >= source.price) value -= 4;
  }
  return value;
}
export function getFeed(catalog, profile) {
  return catalog.filter(p => matches(p, profile.preferences) && !profile.seen.includes(p.id))
    .sort((a, b) => score(b, profile, catalog) - score(a, profile, catalog));
}
export function explainProduct(product, profile, catalog) {
  const related = catalog.find(p => profile.likes.includes(p.id) && p.id !== product.id && p.category === product.category && p.styles.some(s => product.styles.includes(s)));
  if (related) return `Because you liked ${related.name}, which shares its ${product.styles.find(s => related.styles.includes(s))} style and ${product.category.toLowerCase()} category.`;
  if (profile.preferences.categories.includes(product.category)) return `You selected ${product.category.toLowerCase()} in your preferences.`;
  return 'Explore something new. This item is within your selected price range.';
}
export function productChips(product) {
  const price = product.price < 50 ? 'Under $50' : product.price < 100 ? 'Under $100' : `$${product.price}`;
  return [product.category, price].filter(Boolean);
}
export function recordAction(profile, productId, action) {
  const add = list => list.includes(productId) ? list : [...list, productId];
  const next = { ...profile, seen: add(profile.seen) };
  if (action === 'like') next.likes = add(profile.likes);
  else if (action === 'skip') next.skips = add(profile.skips);
  else next.feedback = [...profile.feedback, { productId, reason: action, createdAt: new Date().toISOString() }];
  return next;
}

export function captureFeedState(profile) {
  return { likes: profile.likes, skips: profile.skips, feedback: profile.feedback, seen: profile.seen };
}
export function undoFeedAction(profile, previous) {
  return { ...profile, ...previous };
}
