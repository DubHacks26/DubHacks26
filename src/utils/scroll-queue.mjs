/**
 * Keep a Scroll session stable while the recommendation feed is refreshed.
 * Existing cards retain their position; only new candidates join the end.
 */
export function appendToScrollQueue(queue = [], candidates = []) {
  const currentQueue = Array.isArray(queue) ? queue : [];
  const incoming = Array.isArray(candidates) ? candidates : [];

  if (!currentQueue.length) return incoming;

  const queuedIds = new Set(currentQueue.map(product => product?.id));
  const additions = incoming.filter((product) => {
    if (!product?.id || queuedIds.has(product.id)) return false;
    queuedIds.add(product.id);
    return true;
  });

  return additions.length ? [...currentQueue, ...additions] : currentQueue;
}
