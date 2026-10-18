/**
 * Keep a Scroll session stable while the recommendation feed is refreshed.
 * Preserve visited cards, including the current card, but let the latest
 * recommendations reorder the unseen tail.
 */
export function refreshScrollQueue(queue = [], candidates = [], visitedThrough = 0) {
  const currentQueue = Array.isArray(queue) ? queue : [];
  const incoming = Array.isArray(candidates) ? candidates : [];

  if (!currentQueue.length) return incoming;

  const history = currentQueue.slice(0, Math.max(0, visitedThrough + 1));
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
