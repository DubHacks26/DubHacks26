import config from './recommendation-config.cjs';

export const { EMBEDDING_DIMENSIONS, MAX_INTERESTS, SIMILARITY_THRESHOLD, LEARNING_RATE, NOVEL_INTEREST_LEARNING_RATE } = config;

export function validateVector(value) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) {
    throw new TypeError('Embedding must be an array');
  }
  if (value.length !== EMBEDDING_DIMENSIONS ||
      Array.from(value).some(number => typeof number !== 'number' || !Number.isFinite(number))) {
    throw new RangeError(`Embedding must have ${EMBEDDING_DIMENSIONS} finite numbers`);
  }
  return value;
}

export function normalizeVector(value) {
  validateVector(value);
  const norm = Math.hypot(...value);
  if (!Number.isFinite(norm) || norm === 0) throw new RangeError('Embedding has zero magnitude');
  return Array.from(value, number => number / norm);
}

export function dotProduct(left, right) {
  validateVector(left);
  validateVector(right);
  let sum = 0;
  for (let index = 0; index < EMBEDDING_DIMENSIONS; index++) sum += left[index] * right[index];
  return sum;
}

export function cosineSimilarity(left, right) {
  // Stored product and interest vectors are unit length.
  return dotProduct(left, right);
}

export function weightedUpdate(previous, product, learningRate = LEARNING_RATE) {
  if (!Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 1) {
    throw new RangeError('Learning rate must be in (0, 1]');
  }
  const a = normalizeVector(previous);
  const b = normalizeVector(product);
  return normalizeVector(a.map((number, index) =>
    (1 - learningRate) * number + learningRate * b[index]));
}

export function closestInterest(interests, product) {
  validateVector(product);
  let closest = null;
  for (const interest of interests) {
    const similarity = cosineSimilarity(interest.embedding, product);
    if (!closest || similarity > closest.similarity) {
      closest = { slotIndex: interest.slotIndex, similarity };
    }
  }
  return closest;
}

export function shouldCreateInterest(interests, closest, threshold = SIMILARITY_THRESHOLD) {
  if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) {
    throw new RangeError('Similarity threshold must be between -1 and 1');
  }
  return interests.length < MAX_INTERESTS && (!closest || closest.similarity < threshold);
}

export function updateInterests(interests, product, threshold = SIMILARITY_THRESHOLD, action = 'like') {
  const normalized = normalizeVector(product);
  const closest = closestInterest(interests, normalized);
  if (shouldCreateInterest(interests, closest, threshold)) {
    const slotIndex = Array.from({ length: MAX_INTERESTS }, (_, index) => index)
      .find(index => !interests.some(interest => interest.slotIndex === index));
    return [...interests, { slotIndex, embedding: normalized }];
  }
  const learningRate = action === 'like' && interests.length === MAX_INTERESTS
    && closest.similarity < threshold ? NOVEL_INTEREST_LEARNING_RATE : LEARNING_RATE;
  return interests.map(interest => {
    if (interest.slotIndex !== closest.slotIndex) return interest;
    // An equal blend of exact opposites has no direction. Adopt the new
    // interest instead of trying to normalize a zero vector.
    const cancelsOut = learningRate === 0.5 && Math.hypot(
      ...interest.embedding.map((value, index) => value + normalized[index]),
    ) === 0;
    return {
      ...interest,
      embedding: cancelsOut ? normalized : weightedUpdate(interest.embedding, normalized, learningRate),
    };
  });
}
