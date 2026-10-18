/**
 * Keep a Scroll session stable while the recommendation feed is refreshed.
 * Preserve visited cards, including the current card, but let the latest
 * recommendations reorder the unseen tail.
 */
export function refreshScrollQueue(queue = [], candidates = [], visitedThrough = 0) {
  const currentQueue = Array.isArray(queue) ? queue : [];
  const incoming = Array.isArray(candidates) ? candidates : [];

  if (!currentQueue.length) return incoming;

  const updates = new Map(incoming.filter(product => product?.id).map(product => [product.id, product]));
  // Refresh metadata by ID without moving an active or visited card.
  const history = currentQueue.slice(0, Math.max(0, visitedThrough + 1))
    .map(product => updates.get(product.id) || product);
  const queuedIds = new Set(history.map(product => product?.id));
  // Keep older candidates as a fallback when a response contains only a batch.
  const upcoming = [...incoming, ...currentQueue.slice(history.length)].filter((product) => {
    if (!product?.id || queuedIds.has(product.id)) return false;
    queuedIds.add(product.id);
    return true;
  });

  const refreshed = [...history, ...upcoming];
  return refreshed.length === currentQueue.length
    && refreshed.every((product, index) => product === currentQueue[index])
    ? currentQueue
    : refreshed;
}

export function reorderRemainingScrollQueue(queue = [], candidates = [], currentIndex = 0) {
  const currentQueue = Array.isArray(queue) ? queue : [];
  const incoming = Array.isArray(candidates) ? candidates : [];

  if (!currentQueue.length) return incoming;

  const updates = new Map(incoming.filter(product => product?.id).map(product => [product.id, product]));
  const pinned = currentQueue.slice(0, Math.max(0, currentIndex) + 1)
    .map(product => updates.get(product.id) || product);
  const pinnedIds = new Set(pinned.map(product => product?.id));
  const remaining = incoming.filter(product => product?.id && !pinnedIds.has(product.id));

  const result = [...pinned, ...remaining];
  return result.length === currentQueue.length && result.every((product, index) => product === currentQueue[index])
    ? currentQueue : result;
}
