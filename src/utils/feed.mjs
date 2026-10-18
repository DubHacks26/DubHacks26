export const categories = [
  "Accessories",
  "Audio & entertainment",
  "Beauty & personal care",
  "Clothing",
  "Computer accessories",
  "Fashion & accessories",
  "Fitness & outdoors",
  "Food",
  "Footwear",
  "Hobbies, toys & entertainment",
  "Home & kitchen",
  "Home decor & furniture",
  "Kitchen & dining",
  "Lifestyle fashion",
  "Mobile electronics",
  "Other technology",
  "School Supplies",
  "Tech & electronics",
];

export const defaultPreferences = {
  categories: [],
  minPrice: 20,
  maxPrice: 5000,
};

export const likedCollectionId = "liked";

const legacyCategories = ["Home", "Electronics", "Gaming", "Fashion", "Beauty", "Education"];

const legacyCategoryAliases = {
  tech: "Electronics",
  technology: "Electronics",
  books: "Education",
};

const categoryGroups = {
  Home: ["Fitness & outdoors", "Home & kitchen", "Home decor & furniture", "Kitchen & dining"],
  Electronics: [
    "Audio & entertainment",
    "Computer accessories",
    "Mobile electronics",
    "Other technology",
    "Tech & electronics",
  ],
  Fashion: ["Accessories", "Clothing", "Fashion & accessories", "Footwear", "Lifestyle fashion"],
  Beauty: ["Beauty & personal care"],
  Education: ["Hobbies, toys & entertainment", "School Supplies"],
  Gaming: [],
};

const aliases = {
  minimalism: "minimalist",
  minimal: "minimalist",
  technology: "tech",
  books: "education",
  "home-decor": "home",
  neutrals: "neutral",
  functional: "practical",
};

const stopWords = new Set([
  "about", "and", "are", "for", "from", "with", "the", "this", "that",
  "your", "you", "new", "set", "pack", "piece", "pieces", "inch", "inches",
  "size", "color", "style", "edition", "women", "womens", "men", "mens",
  "machine", "machines", "maker", "makers", "dispenser", "dispensers",
  "gadget", "gadgets", "accessory", "accessories", "product", "products",
]);

const actionStrength = {
  like: 1,
  save: 0.5,
  unsave: -0.5,
  skip: -0.25,
  show_less: -1,
  unlike: -1,
  too_expensive: -0.75,
  less_category: -1,
};

const personalWeights = {
  category: 0.1,
  subcategory: 0.2,
  hashtags: 0.35,
  title: 0.35,
};

const overallWeights = {
  personal: 0.65,
  price: 0.15,
  quality: 0.12,
  popularity: 0.08,
};

function parseList(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string")
      : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

export function normalizeTag(value) {
  const tag = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[\s_]+/g, "-");
  return aliases[tag] || tag;
}

function normalizeCategory(value) {
  if (!value) return null;
  const raw = String(value).trim();
  return categories.find((category) => normalizeTag(category) === normalizeTag(raw))
    || legacyCategories.find((category) => normalizeTag(category) === normalizeTag(raw))
    || legacyCategoryAliases[raw.toLowerCase()]
    || null;
}

function categoryMatches(preference, candidate) {
  const normalizedPreference = normalizeCategory(preference);
  const normalizedCandidate = normalizeCategory(candidate);
  if (!normalizedPreference || !normalizedCandidate) return false;
  return normalizedPreference === normalizedCandidate
    || (categoryGroups[normalizedPreference] || []).includes(normalizedCandidate);
}

export function normalizeProduct(raw = {}) {
  const sourceMainCategory = raw.main_category || raw.mainCategory || null;
  const sourceCategory = raw.category || sourceMainCategory || null;
  const mainCategory = sourceMainCategory || sourceCategory;
  const hashtags = [...new Set(
    [...parseList(raw.hashtags), ...parseList(raw.tags)]
      .map(normalizeTag)
      .filter(Boolean),
  )];
  const rawPrice = raw.price_cents ?? raw.priceCents;
  const price = Number.isFinite(Number(rawPrice))
    ? Number(rawPrice) / 100
    : Number.isFinite(Number(raw.price))
      ? Number(raw.price)
      : null;
  const rating = raw.rating !== null && raw.rating !== undefined
    && raw.rating !== "" && Number.isFinite(Number(raw.rating))
    ? Number(raw.rating)
    : null;
  const reviewValue = raw.review_count ?? raw.reviewCount ?? raw.reviews;
  const reviews = reviewValue !== null && reviewValue !== undefined
    && reviewValue !== "" && Number.isFinite(Number(reviewValue))
    ? Number(reviewValue)
    : null;

  return {
    ...raw,
    id: raw.asin ?? raw.id,
    asin: raw.asin ?? raw.id,
    name: raw.title || raw.name || "Untitled product",
    description: raw.summary || raw.description || raw.title || raw.name || "",
    category: normalizeCategory(sourceMainCategory)
      || normalizeCategory(sourceCategory)
      || sourceCategory
      || null,
    mainCategory,
    subcategory: raw.subcategory || null,
    hashtags,
    tags: hashtags,
    image: raw.image_url || raw.imageUrl || raw.image || "/product-placeholder.svg",
    productUrl: raw.product_url || raw.productURL || raw.productUrl || null,
    price,
    rating,
    reviews,
    boughtInPastMonth: raw.bought_in_past_month || raw.boughtInPastMonth || null,
    badge: raw.badge || null,
    similarity: raw.similarity !== null && raw.similarity !== undefined
      && raw.similarity !== "" && Number.isFinite(Number(raw.similarity))
      ? Number(raw.similarity)
      : null,
  };
}

export function createProfile() {
  return {
    preferences: { ...defaultPreferences, categories: [] },
    events: [],
    likes: [],
    saved: [],
    skips: [],
    feedback: [],
    seen: [],
    onboarded: false,
  };
}

function normalizeEvent(event) {
  if (
    !event
    || !Object.hasOwn(actionStrength, event.action)
    || event.productId === undefined
    || event.productId === null
  ) return null;
  return {
    id: event.id ?? `${event.productId}:${event.action}:${event.createdAt ?? ""}`,
    productId: event.productId,
    action: event.action,
    createdAt: event.createdAt || new Date().toISOString(),
  };
}

function seenFromEvents(events) {
  return [...new Set(
    events
      .filter((event) => ["like", "skip", "show_less", "too_expensive", "less_category"].includes(event.action))
      .map((event) => event.productId),
  )];
}

function rebuildProfile(profile, events, seen = profile.seen) {
  const ordered = events
    .map(normalizeEvent)
    .filter(Boolean)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const states = new Map();
  for (const event of ordered) {
    if (event.action === "like" || event.action === "unlike") {
      states.set(`${event.productId}:like`, event.action === "like");
    }
    if (event.action === "save" || event.action === "unsave") {
      states.set(`${event.productId}:save`, event.action === "save");
    }
  }
  return {
    ...profile,
    events: ordered,
    likes: [...states].filter(([key, value]) => key.endsWith(":like") && value)
      .map(([key]) => key.slice(0, -5)),
    saved: [...states].filter(([key, value]) => key.endsWith(":save") && value)
      .map(([key]) => key.slice(0, -5)),
    skips: [...new Set(ordered.filter((event) => event.action === "skip").map((event) => event.productId))],
    feedback: ordered.filter((event) =>
      ["show_less", "too_expensive", "less_category"].includes(event.action)),
    seen: [...new Set(seen)],
  };
}

export function restoreProfile(raw) {
  const profile = createProfile();
  if (!raw || typeof raw !== "object") return profile;
  const preferences = raw.preferences && typeof raw.preferences === "object"
    ? raw.preferences
    : {};
  const minPrice = Number(preferences.minPrice);
  const maxPrice = Number(preferences.maxPrice);
  profile.preferences = {
    categories: Array.isArray(preferences.categories)
      ? [...new Set(preferences.categories.map(normalizeCategory).filter(Boolean))]
      : [],
    minPrice: Number.isFinite(minPrice) && minPrice >= 0
      ? minPrice
      : defaultPreferences.minPrice,
    maxPrice: Number.isFinite(maxPrice) && maxPrice >= minPrice
      ? maxPrice
      : defaultPreferences.maxPrice,
  };
  profile.onboarded = raw.onboarded === true;
  if (Array.isArray(raw.events) && (raw.events.length > 0 || !(
    raw.likes?.length || raw.saved?.length || raw.skips?.length || raw.feedback?.length
  ))) {
    const orderedEvents = raw.events.map(normalizeEvent).filter(Boolean);
    const seen = Array.isArray(raw.seen) ? raw.seen : [];
    return rebuildProfile(profile, orderedEvents, seen);
  }

  const legacyEvents = [];
  const createdAt = new Date().toISOString();
  for (const productId of Array.isArray(raw.likes) ? raw.likes : []) {
    if (typeof productId === "string" || typeof productId === "number") {
      legacyEvents.push({ productId, action: "like", createdAt });
    }
  }
  for (const productId of Array.isArray(raw.saved) ? raw.saved : []) {
    if (typeof productId === "string" || typeof productId === "number") {
      legacyEvents.push({ productId, action: "save", createdAt });
    }
  }
  for (const productId of Array.isArray(raw.skips) ? raw.skips : []) {
    if (typeof productId === "string" || typeof productId === "number") {
      legacyEvents.push({ productId, action: "skip", createdAt });
    }
  }
  for (const feedback of Array.isArray(raw.feedback) ? raw.feedback : []) {
    const action = feedback.reason === "price"
      ? "too_expensive"
      : feedback.reason === "category"
        ? "less_category"
        : "show_less";
    legacyEvents.push({ productId: feedback.productId, action, createdAt: feedback.createdAt || createdAt });
  }
  return rebuildProfile(
    profile,
    legacyEvents,
    Array.isArray(raw.seen) ? raw.seen : seenFromEvents(legacyEvents),
  );
}

export function matches() {
  return true;
}

function recency(event, now) {
  const createdAt = Date.parse(event.createdAt);
  if (!Number.isFinite(createdAt)) return 0;
  const ageDays = Math.max(0, (now - createdAt) / 86_400_000);
  return 2 ** (-ageDays / 30);
}

function evidenceFor(event, now) {
  return actionStrength[event.action] * recency(event, now);
}

function featureAffinity(feature, candidate, profile, context) {
  if (!candidate) return null;
  let evidence = 0;
  for (const event of profile.events) {
    const source = context.productById.get(event.productId);
    if (!source) continue;
    const values = feature === "hashtags"
      ? source.hashtags || []
      : feature === "category"
        ? [source.mainCategory || source.category]
        : [source[feature]];
    if (values.some((value) => value && normalizeTag(value) === normalizeTag(candidate))) {
      evidence += evidenceFor(event, context.now);
    }
  }
  if (feature === "category" && profile.preferences.categories.some(
    (value) => categoryMatches(value, candidate),
  )) evidence += 1;
  return 0.5 + 0.5 * Math.tanh(evidence / 2);
}

function hashtagAffinity(product, profile, context) {
  const tags = [...new Set(product.hashtags || [])];
  const lexical = tags.length
    ? tags.reduce((sum, tag) => sum + featureAffinity("hashtags", tag, profile, context), 0) / tags.length
    : null;
  const vector = Number.isFinite(product.similarity)
    ? Math.max(0, Math.min(1, (product.similarity + 1) / 2))
    : null;
  if (lexical === null) return vector;
  if (vector === null) return lexical;
  return lexical * 0.7 + vector * 0.3;
}

function titleTokens(title) {
  return new Set(
    String(title || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !stopWords.has(token)),
  );
}

function titleSimilarity(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function titleAffinity(product, profile, context) {
  const candidate = context.titleTokens.get(product.id);
  if (!candidate?.size) return null;
  let signedSimilarity = 0;
  let totalEvidence = 0;
  for (const event of profile.events) {
    const source = context.productById.get(event.productId);
    if (!source || source.id === product.id) continue;
    const weight = evidenceFor(event, context.now);
    signedSimilarity += weight * titleSimilarity(
      candidate,
      context.titleTokens.get(source.id) || new Set(),
    );
    totalEvidence += Math.abs(weight);
  }
  if (!totalEvidence) return 0.5;
  return Math.max(0, Math.min(1, 0.5 + 0.5 * signedSimilarity / totalEvidence));
}

function weightedAvailableScore(parts) {
  const available = parts.filter((part) => part.value !== null);
  const totalWeight = available.reduce((sum, part) => sum + part.weight, 0);
  if (!totalWeight) return 0.5;
  return available.reduce((sum, part) => sum + part.value * part.weight / totalWeight, 0);
}

function personalScoreWithContext(product, profile, context) {
  return weightedAvailableScore([
    { value: featureAffinity("category", product.mainCategory || product.category, profile, context), weight: personalWeights.category },
    { value: featureAffinity("subcategory", product.subcategory, profile, context), weight: personalWeights.subcategory },
    { value: hashtagAffinity(product, profile, context), weight: personalWeights.hashtags },
    { value: titleAffinity(product, profile, context), weight: personalWeights.title },
  ]);
}

export function personalScore(product, profile, catalog, now = Date.now()) {
  return personalScoreWithContext(product, profile, buildContext(catalog, now));
}

function priceScore(product, profile, context) {
  if (!Number.isFinite(product.price)) return null;
  const preferences = profile.preferences;
  const min = Math.max(0, Number(preferences.minPrice) || 0);
  let max = Math.max(min, Number(preferences.maxPrice) || min);
  let weightedLogPrice = 0;
  let priceEvidence = 0;
  const latestLikes = new Map();
  for (const event of profile.events) {
    if (event.action === "like" && profile.likes.includes(event.productId)) {
      latestLikes.set(event.productId, event);
    }
  }
  for (const event of latestLikes.values()) {
    const likedProduct = context.productById.get(event.productId);
    if (!Number.isFinite(likedProduct?.price) || likedProduct.price <= 0) continue;
    const weight = recency(event, context.now);
    weightedLogPrice += Math.log(likedProduct.price) * weight;
    priceEvidence += weight;
  }
  for (const event of profile.events) {
    if (event.action !== "too_expensive") continue;
    const rejectedProduct = context.productById.get(event.productId);
    if (!Number.isFinite(rejectedProduct?.price) || rejectedProduct.price <= 0) continue;
    const inferredMax = rejectedProduct.price * 0.8;
    const weight = Math.abs(evidenceFor(event, context.now));
    weightedLogPrice += Math.log(Math.max(inferredMax, 0.01)) * weight;
    priceEvidence += weight;
  }
  if (priceEvidence) {
    const learnedMax = Math.exp(weightedLogPrice / priceEvidence);
    const confidence = priceEvidence / (priceEvidence + 3);
    max = Math.max(min, Math.exp(
      Math.log(Math.max(max, 0.01)) * (1 - confidence)
      + Math.log(Math.max(learnedMax, 0.01)) * confidence,
    ));
  }
  if (product.price >= min && product.price <= max) return 1;
  const boundary = product.price < min ? min : max;
  if (boundary <= 0) return 0.5;
  return Math.exp(-0.5 * Math.abs(Math.log(Math.max(product.price, 0.01) / boundary)));
}

function meanRating(catalog) {
  const ratings = catalog.map((product) => product.rating).filter(Number.isFinite);
  return ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 4;
}

function qualityScore(product, ratingPrior) {
  if (!Number.isFinite(product.rating)) return null;
  const count = Math.max(0, product.reviews || 0);
  const priorStrength = 100;
  const smoothed = (count / (count + priorStrength)) * product.rating
    + (priorStrength / (count + priorStrength)) * ratingPrior;
  return Math.max(0, Math.min(1, smoothed / 5));
}

function popularityScore(product) {
  let countScore = null;
  if (typeof product.boughtInPastMonth === "string") {
    const match = product.boughtInPastMonth.match(/([\d,.]+)\s*([kK])?\s*\+/);
    if (match) {
      const count = Number(match[1].replaceAll(",", "")) * (match[2] ? 1000 : 1);
      if (Number.isFinite(count)) countScore = Math.min(1, Math.log1p(count) / Math.log1p(10_000));
    }
  }
  const badgeScore = typeof product.badge === "string"
    && /\b(best seller|amazon'?s choice)\b/i.test(product.badge)
    ? 0.95
    : null;
  if (countScore === null && badgeScore === null) return null;
  return weightedAvailableScore([
    { value: countScore, weight: 0.75 },
    { value: badgeScore, weight: 0.25 },
  ]);
}

function buildContext(catalog, now) {
  return {
    productById: new Map(catalog.map((product) => [product.id, product])),
    titleTokens: new Map(catalog.map((product) => [product.id, titleTokens(product.name)])),
    ratingPrior: meanRating(catalog),
    now,
  };
}

function scoreWithContext(product, profile, context) {
  const baseScore = weightedAvailableScore([
    { value: personalScoreWithContext(product, profile, context), weight: overallWeights.personal },
    { value: priceScore(product, profile, context), weight: overallWeights.price },
    { value: qualityScore(product, context.ratingPrior), weight: overallWeights.quality },
    { value: popularityScore(product), weight: overallWeights.popularity },
  ]);
  const productCategory = product.mainCategory || product.category;
  const categoryDislikes = profile.events.reduce((total, event) => {
    if (event.action !== "less_category") return total;
    const source = context.productById.get(event.productId);
    const sourceCategory = source?.mainCategory || source?.category;
    return categoryMatches(sourceCategory, productCategory)
      ? total + recency(event, context.now)
      : total;
  }, 0);
  const categoryPenalty = 0.35 * (1 - Math.exp(-2 * categoryDislikes));
  return Math.max(0, baseScore - categoryPenalty);
}

export function score(product, profile, catalog, now = Date.now()) {
  return scoreWithContext(product, profile, buildContext(catalog, now));
}

export function getFeed(catalog, profile, now = Date.now(), sourceCatalog = catalog) {
  const context = buildContext([...new Map(
    [...catalog, ...sourceCatalog].map((product) => [product.id, product]),
  ).values()], now);
  return catalog
    .filter((product) => !profile.seen.includes(product.id))
    .map((product) => ({ product, score: scoreWithContext(product, profile, context) }))
    .sort((a, b) => b.score - a.score || String(a.product.id).localeCompare(String(b.product.id)))
    .map(({ product }) => product);
}

export function explainProduct(product, profile, catalog) {
  const liked = profile.events
    .filter((event) => event.action === "like" && profile.likes.includes(event.productId))
    .map((event) => catalog.find((item) => item.id === event.productId))
    .filter(Boolean)
    .find((item) =>
      (product.subcategory && item.subcategory === product.subcategory)
      || product.hashtags?.some((tag) => item.hashtags?.includes(tag))
      || [...titleTokens(product.name)].some((token) => titleTokens(item.name).has(token)),
    );
  if (liked && product.subcategory && liked.subcategory === product.subcategory) {
    return `Because you liked another ${product.subcategory.toLowerCase()} item.`;
  }
  const sharedTag = liked && product.hashtags?.find((tag) => liked.hashtags?.includes(tag));
  if (sharedTag) return `Because you liked another item tagged ${sharedTag.replaceAll("-", " ")}.`;
  if (profile.preferences.categories.some(
    (category) => categoryMatches(category, product.mainCategory || product.category),
  )) {
    return `You selected ${product.category.toLowerCase()} in your feed preferences.`;
  }
  return "This item matches your preferences and product feedback.";
}

export function productChips(product) {
  const price = Number.isFinite(product.price)
    ? product.price < 50
      ? "Under $50"
      : product.price < 100
        ? "Under $100"
        : `$${product.price}`
    : null;
  return [
    product.category,
    product.subcategory,
    ...(product.hashtags || []).slice(0, 2).map((tag) => `#${tag}`),
    price,
  ].filter(Boolean);
}

export function recordAction(profile, productId, action, event = {}) {
  if (!Object.hasOwn(actionStrength, action)) return profile;
  const normalized = normalizeEvent({
    ...event,
    productId,
    action,
    createdAt: event.createdAt || new Date().toISOString(),
  });
  if (!normalized) return profile;
  const seen = ["like", "skip", "show_less", "too_expensive", "less_category"].includes(action)
    ? [...profile.seen, productId]
    : profile.seen;
  return rebuildProfile(profile, [...profile.events, normalized], seen);
}

export function removeAction(profile, eventId) {
  const events = profile.events.filter((event) => event.id !== eventId);
  const stillSeen = new Set(seenFromEvents(events));
  return rebuildProfile(
    profile,
    events,
    profile.seen.filter((productId) => stillSeen.has(productId)),
  );
}

export function captureFeedState(profile) {
  return {
    events: profile.events,
    likes: profile.likes,
    saved: profile.saved,
    skips: profile.skips,
    feedback: profile.feedback,
    seen: profile.seen,
  };
}

export function undoFeedAction(profile, previous) {
  return { ...profile, ...previous };
}
