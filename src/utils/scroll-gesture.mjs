const IDLE_MS = 120;
const MIN_PAGE_INTERVAL_MS = 240;

export function scrollPageIndex(scrollTop, pageHeight, productCount) {
  if (!(pageHeight > 0) || !(productCount > 0) || !Number.isFinite(scrollTop)) return 0;
  return Math.max(0, Math.min(productCount - 1, Math.round(scrollTop / pageHeight)));
}

export function scrollPageTop(index, pageHeight, productCount) {
  if (!(pageHeight > 0) || !(productCount > 0)) return 0;
  return Math.max(0, Math.min(productCount - 1, index)) * pageHeight;
}

export function forwardScrollDeparture(products, previousIndex, nextIndex, reportedIds) {
  const departed = products[previousIndex];
  return nextIndex > previousIndex && departed && !reportedIds.has(departed.id) ? departed : null;
}

export const MAX_SCROLL_PRODUCTS = 4;
const NATIVE_GESTURE_IDLE_MS = 180;

// Keep the original anchor through the whole flick and its momentum. Reopening
// the range for every wheel tick would allow one gesture to run through the feed.
export function updateNativeScrollGesture(previous, { now, scrollTop, pageHeight, productCount, deltaY = 1 }) {
  const magnitude = Math.abs(deltaY);
  const meaningful = magnitude >= 1;
  const priorDelta = Math.abs(previous?.lastDelta ?? 0);
  const age = now - (previous?.startedAt ?? now);
  // A new finger impulse can arrive before macOS stops delivering the old
  // momentum tail. Silence alone cannot identify the next deliberate flick.
  const renewed = previous?.decayed && magnitude >= Math.max(4, (previous.tailFloor ?? priorDelta) * 3);
  const reversed = previous && Math.sign(deltaY) !== Math.sign(previous.lastDelta) && magnitude >= 12;
  const fresh = !previous
    || (meaningful && now - (previous.lastMeaningfulAt ?? previous.lastAt) >= NATIVE_GESTURE_IDLE_MS)
    || (age >= 160 && (renewed || reversed));
  const peakDelta = fresh ? magnitude : Math.max(previous.peakDelta ?? priorDelta, magnitude);
  return {
    anchor: fresh ? scrollPageIndex(scrollTop, pageHeight, productCount) : previous.anchor,
    startedAt: fresh ? now : previous.startedAt,
    lastAt: now,
    lastMeaningfulAt: fresh || meaningful ? now : previous.lastMeaningfulAt,
    lastDelta: deltaY,
    peakDelta,
    tailFloor: fresh ? magnitude : Math.min(previous.tailFloor ?? magnitude, magnitude),
    decayed: fresh ? false : previous.decayed || magnitude <= peakDelta * 0.35,
  };
}

export function shouldCancelMouseDrag({ pointerType, buttons }) {
  return pointerType === "mouse" && buttons === 0;
}

export function limitNativeScrollTop(scrollTop, gesture, pageHeight, productCount) {
  if (!gesture || !(pageHeight > 0) || !(productCount > 0)) return scrollTop;
  const first = scrollPageTop(Math.max(0, gesture.anchor - MAX_SCROLL_PRODUCTS), pageHeight, productCount);
  const last = scrollPageTop(gesture.anchor + MAX_SCROLL_PRODUCTS, pageHeight, productCount);
  return Math.max(first, Math.min(last, scrollTop));
}

export function createWheelGesture() {
  return { axis: "", distance: 0, consumed: false, lastAt: -Infinity, lastDelta: 0, acceptedAt: -Infinity };
}

/** One page per wheel gesture, without letting a long inertial tail lock out a fresh flick. */
export function advanceWheelGesture(previous, { deltaX = 0, deltaY = 0, deltaMode = 0, now, pageHeight = 600 }) {
  const scale = deltaMode === 1 ? 16 : deltaMode === 2 ? pageHeight : 1;
  const x = deltaX * scale;
  const y = deltaY * scale;
  const axis = Math.abs(x) > Math.abs(y) ? "x" : "y";
  const delta = axis === "x" ? x : y;
  if (!Number.isFinite(delta) || !delta) return { state: previous, action: null };

  const gap = now - previous.lastAt;
  const elapsed = now - previous.acceptedAt;
  const magnitude = Math.abs(delta);
  const reversed = Math.sign(delta) !== Math.sign(previous.lastDelta);
  const renewedImpulse = magnitude >= Math.max(16, Math.abs(previous.lastDelta) * 1.8);
  // Mouse wheels send separated, similarly sized ticks; trackpad inertia arrives
  // continuously with falling deltas. Either a pause or a renewed impulse starts
  // a new gesture after the short page transition, even if inertia never stops.
  const freshGesture = gap >= IDLE_MS
    || (elapsed >= MIN_PAGE_INTERVAL_MS && (
      (gap >= 40 && magnitude >= 40)
      || renewedImpulse
      || (reversed && magnitude >= 12)
    ));
  const reset = previous.axis !== axis || freshGesture;
  const state = {
    axis,
    distance: (reset ? 0 : previous.distance) + delta,
    consumed: reset ? false : previous.consumed,
    lastAt: now,
    lastDelta: delta,
    acceptedAt: previous.acceptedAt,
  };
  const threshold = axis === "x" ? 180 : 16;
  if (state.consumed || elapsed < MIN_PAGE_INTERVAL_MS || Math.abs(state.distance) < threshold) {
    return { state, action: null };
  }
  state.consumed = true;
  state.acceptedAt = now;
  return { state, action: { axis, direction: Math.sign(state.distance) } };
}
