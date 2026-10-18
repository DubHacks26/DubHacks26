import test from "node:test";
import assert from "node:assert/strict";
import { advanceWheelGesture, createWheelGesture, forwardScrollDeparture, scrollPageIndex, scrollPageTop, updateNativeScrollGesture, limitNativeScrollTop, shouldCancelMouseDrag } from "../src/utils/scroll-gesture.mjs";

test("native scroll follows the nearest page and clamps overscroll at both ends", () => {
  assert.equal(scrollPageIndex(299, 600, 20), 0);
  assert.equal(scrollPageIndex(301, 600, 20), 1);
  assert.equal(scrollPageIndex(1680, 600, 20), 3);
  assert.equal(scrollPageIndex(-100, 600, 20), 0);
  assert.equal(scrollPageIndex(20000, 600, 20), 19);
  assert.equal(scrollPageIndex(600, 0, 20), 0);
  assert.equal(scrollPageIndex(600, 600, 0), 0);
});

test("resizing aligns the same active product to its new page height", () => {
  assert.equal(scrollPageTop(4, 600, 20), 2400);
  assert.equal(scrollPageTop(4, 450, 20), 1800);
  assert.equal(scrollPageIndex(scrollPageTop(4, 450, 20), 450, 20), 4);
  assert.equal(scrollPageTop(30, 450, 20), 8550);
});

test("native skips describe actual forward departures once, not crossed pages or scroll ticks", () => {
  const products = ["one", "two", "three", "four"].map(id => ({ id }));
  const reported = new Set();
  assert.equal(forwardScrollDeparture(products, 0, 0, reported), null);
  assert.equal(forwardScrollDeparture(products, 0, 3, reported), products[0]);
  reported.add("one");
  assert.equal(forwardScrollDeparture(products, 0, 3, reported), null);
  assert.equal(forwardScrollDeparture(products, 3, 1, reported), null);
  assert.equal(forwardScrollDeparture(products, 1, 2, reported), products[1]);
});

function session() {
  let state = createWheelGesture();
  return (deltaY, now, extra = {}) => {
    const result = advanceWheelGesture(state, { deltaY, now, ...extra });
    state = result.state;
    return result.action;
  };
}

test("a decaying trackpad gesture advances once even after its animation ends", () => {
  const wheel = session();
  assert.deepEqual(wheel(80, 0), { axis: "y", direction: 1 });
  for (let at = 16; at < 1000; at += 16) {
    assert.equal(wheel(Math.max(0.1, 80 * Math.exp(-at / 100)), at), null);
  }
});

test("a deliberate fresh impulse works during a long inertial tail", () => {
  const wheel = session();
  wheel(70, 0);
  for (let at = 16; at <= 320; at += 16) wheel(70 * Math.exp(-at / 100), at);
  assert.deepEqual(wheel(50, 336), { axis: "y", direction: 1 });
  assert.equal(wheel(45, 352), null);
});

test("separated mouse wheel ticks remain responsive without accepting every tick", () => {
  const wheel = session();
  assert.deepEqual(wheel(100, 0), { axis: "y", direction: 1 });
  assert.equal(wheel(100, 100), null);
  assert.equal(wheel(100, 200), null);
  assert.deepEqual(wheel(100, 300), { axis: "y", direction: 1 });
});

test("a quick direction change after a page transition navigates back", () => {
  const wheel = session();
  wheel(60, 0);
  wheel(4, 230);
  assert.deepEqual(wheel(-30, 250), { axis: "y", direction: -1 });
});

test("small deltas accumulate and line-based wheels normalize to pixels", () => {
  const wheel = session();
  assert.equal(wheel(5, 0), null);
  assert.equal(wheel(5, 16), null);
  assert.equal(wheel(5, 32), null);
  assert.deepEqual(wheel(5, 48), { axis: "y", direction: 1 });
  assert.deepEqual(session()(1, 0, { deltaMode: 1 }), { axis: "y", direction: 1 });
});

test("horizontal gestures require intentional distance and like only once", () => {
  const wheel = session();
  assert.equal(wheel(0, 0, { deltaX: 70 }), null);
  assert.equal(wheel(0, 16, { deltaX: 70 }), null);
  assert.deepEqual(wheel(0, 32, { deltaX: 70 }), { axis: "x", direction: 1 });
  assert.equal(wheel(0, 48, { deltaX: 65 }), null);
});

test("one large desktop flick is capped at four products in either direction", () => {
  const input = { now: 0, scrollTop: 6000, pageHeight: 600, productCount: 30 };
  const gesture = updateNativeScrollGesture(null, input);
  assert.equal(limitNativeScrollTop(20000, gesture, 600, 30), 8400);
  assert.equal(limitNativeScrollTop(0, gesture, 600, 30), 3600);
  assert.equal(limitNativeScrollTop(6500, gesture, 600, 30), 6500);
});

test("a long momentum tail cannot reopen the four-product limit", () => {
  let gesture = updateNativeScrollGesture(null, { now: 0, scrollTop: 0, pageHeight: 600, productCount: 30 });
  for (let now = 16; now < 2000; now += 16) {
    gesture = updateNativeScrollGesture(gesture, { now, scrollTop: 2400, pageHeight: 600, productCount: 30 });
    assert.equal(limitNativeScrollTop(12000, gesture, 600, 30), 2400);
  }
  // The same bound also applies to a snap animation after wheel input stops.
  assert.equal(limitNativeScrollTop(3000, gesture, 600, 30), 2400);
});

test("a separate flick starts a fresh range and catalog ends remain bounded", () => {
  const first = updateNativeScrollGesture(null, { now: 0, scrollTop: 0, pageHeight: 600, productCount: 30 });
  const second = updateNativeScrollGesture(first, { now: 200, scrollTop: 2400, pageHeight: 600, productCount: 30 });
  assert.equal(limitNativeScrollTop(20000, second, 600, 30), 4800);
  const end = updateNativeScrollGesture(null, { now: 0, scrollTop: 16800, pageHeight: 600, productCount: 30 });
  assert.equal(limitNativeScrollTop(30000, end, 600, 30), 17400);
  assert.equal(limitNativeScrollTop(-500, first, 600, 30), 0);
  assert.equal(limitNativeScrollTop(4800, null, 600, 30), 4800);
});

test("direction reversal keeps the gesture anchor; the idle boundary starts a new one", () => {
  const first = updateNativeScrollGesture(null, { now: 0, scrollTop: 6000, pageHeight: 600, productCount: 30 });
  const reversed = updateNativeScrollGesture(first, { now: 100, scrollTop: 8400, pageHeight: 600, productCount: 30 });
  assert.equal(limitNativeScrollTop(0, reversed, 600, 30), 3600);
  const fresh = updateNativeScrollGesture(reversed, { now: 280, scrollTop: 8400, pageHeight: 600, productCount: 30 });
  assert.equal(limitNativeScrollTop(30000, fresh, 600, 30), 10800);
});

test("another deliberate flick during a momentum tail opens the next range without a click", () => {
  let gesture = updateNativeScrollGesture(null, { now: 0, scrollTop: 0, pageHeight: 600, productCount: 30, deltaY: 80 });
  for (let now = 16; now <= 320; now += 16) {
    gesture = updateNativeScrollGesture(gesture, { now, scrollTop: 2400, pageHeight: 600, productCount: 30, deltaY: 80 * Math.exp(-now / 80) });
    assert.equal(limitNativeScrollTop(5000, gesture, 600, 30), 2400);
  }
  const next = updateNativeScrollGesture(gesture, { now: 336, scrollTop: 2400, pageHeight: 600, productCount: 30, deltaY: 60 });
  assert.equal(limitNativeScrollTop(20000, next, 600, 30), 4800);
});

test("subpixel inertia does not keep a gentle new gesture locked", () => {
  let gesture = updateNativeScrollGesture(null, { now: 0, scrollTop: 0, pageHeight: 600, productCount: 30, deltaY: 80 });
  for (let now = 16; now <= 1000; now += 16) {
    gesture = updateNativeScrollGesture(gesture, { now, scrollTop: 2400, pageHeight: 600, productCount: 30, deltaY: 80 * Math.exp(-now / 80) });
    assert.equal(limitNativeScrollTop(5000, gesture, 600, 30), 2400);
  }
  for (const [now, deltaY] of [[1008, 1], [1024, 2], [1040, 5]]) {
    gesture = updateNativeScrollGesture(gesture, { now, scrollTop: 2400, pageHeight: 600, productCount: 30, deltaY });
  }
  assert.equal(limitNativeScrollTop(20000, gesture, 600, 30), 4800);
});

test("stale mouse drags cancel when the button has been released, without affecting touch", () => {
  assert.equal(shouldCancelMouseDrag({ pointerType: 'mouse', buttons: 0 }), true);
  assert.equal(shouldCancelMouseDrag({ pointerType: 'mouse', buttons: 1 }), false);
  assert.equal(shouldCancelMouseDrag({ pointerType: 'touch', buttons: 0 }), false);
});
