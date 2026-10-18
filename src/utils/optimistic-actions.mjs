import { recordAction } from './feed.mjs';

// Replay pending intents after confirmed events. Server timestamps can be later
// than a second click, so temporary events must always follow the durable base.
export function withPendingActions(profile, pending = []) {
  let result = profile;
  let clock = Math.max(0, ...profile.events.map(event => Date.parse(event.createdAt) || 0));
  for (const event of pending) {
    clock = Math.max(clock + 1, Date.parse(event.createdAt) || 0);
    result = recordAction(result, event.productId, event.action, {
      ...event, createdAt: new Date(clock).toISOString(),
    });
  }
  return result;
}

// Preserve order for repeated actions on the same product while unrelated
// products can save concurrently. A failed write never blocks the next intent.
export function createProductActionQueue(save) {
  const tails = new Map();
  return (productId, action, context) => {
    const previous = tails.get(productId) || Promise.resolve();
    const operation = previous.catch(() => {}).then(() => save(productId, action, context));
    tails.set(productId, operation);
    const clean = () => { if (tails.get(productId) === operation) tails.delete(productId); };
    operation.then(clean, clean);
    return operation;
  };
}
