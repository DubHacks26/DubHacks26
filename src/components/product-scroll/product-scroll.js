"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { formatProductPrice } from "@/utils/catalogProduct.mjs";
import {
  reorderRemainingScrollQueue,
  refreshScrollQueue,
} from "@/utils/scroll-queue.mjs";
import { advanceWheelGesture, createWheelGesture, forwardScrollDeparture, scrollPageIndex, scrollPageTop, updateNativeScrollGesture, limitNativeScrollTop, shouldCancelMouseDrag } from "@/utils/scroll-gesture.mjs";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import styles from "./product-scroll.module.css";

const AXIS_LOCK = 12;
const HEART_DISTANCE = 90;
const EDGE_RESISTANCE = 0.24;
const SWIPE_EXIT_DURATION = 220;
const DESKTOP_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

function subscribeDesktopPointer(listener) {
  const media = window.matchMedia(DESKTOP_POINTER_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function desktopPointerSnapshot() {
  return window.matchMedia(DESKTOP_POINTER_QUERY).matches;
}

function serverPointerSnapshot() {
  return false;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function ProductScroll({
  products: incomingProducts = [],
  liked,
  saved,
  onDetails,
  onHeart,
  onSkip,
  onSave,
  onShare,
  loading = false,
  error = "",
  onRetry,
  reorderUnseen = false,
  searchQuery = "",
  onExitSearch,
  cartTotal = 0,
  budgetLimit = 400,
}) {
  const nativeDesktop = useSyncExternalStore(subscribeDesktopPointer, desktopPointerSnapshot, serverPointerSnapshot);
  const [queue, setQueue] = useState(() => incomingProducts);
  const [cursor, setCursor] = useState(0);
  const [drag, setDrag] = useState({ axis: "", x: 0, y: 0 });
  const [heartPulse, setHeartPulse] = useState(false);
  const [exitSwipe, setExitSwipe] = useState(null);
  const [imageRatios, setImageRatios] = useState({});
  const [hoveredCard, setHoveredCard] = useState(null);
  const [wheelSourceSlot, setWheelSourceSlot] = useState(null);
  const wheelSourceRef = useRef(null);
  const wheelSourceTimer = useRef(null);
  const [boundaryMessage, setBoundaryMessage] = useState("");
  const gesture = useRef(null);
  const wheelGesture = useRef(createWheelGesture());
  const heartTimer = useRef(null);
  const boundaryTimer = useRef(null);
  const exitTimer = useRef(null);
  const cardClickTimer = useRef(null);
  const suppressCardClick = useRef(false);
  const viewportRef = useRef(null);
  const nativeScrollRef = useRef(null);
  const nativePageHeight = useRef(0);
  const nativeScrollFrame = useRef(0);
  const nativeTarget = useRef(null);
  const nativeWheelGesture = useRef(null);
  const nativeDepartures = useRef(new Set());
  const nativeLikedDepartures = useRef(new Set());
  const pendingDrag = useRef(null);
  const dragFrame = useRef(0);
  const shownAt = useRef(0);
  const visitedThrough = useRef(0);
  // Event handlers can run more than once before React commits a render.
  // Advance this cursor synchronously so the next gesture uses the new card.
  const session = useRef({ products: incomingProducts, index: 0, exiting: null });

  useEffect(() => {
    let active = true;
    // Keep the active card stable; search mode can personalize only what remains.
    Promise.resolve().then(() => {
      if (active) {
        setQueue(queue => reorderUnseen
          ? reorderRemainingScrollQueue(queue, incomingProducts, session.current.index)
          : refreshScrollQueue(queue, incomingProducts, visitedThrough.current));
      }
    });
    return () => {
      active = false;
    };
  }, [incomingProducts, reorderUnseen]);

  // Render the first server-loaded batch immediately; later batches enter via
  // the stable queue above.
  const products = queue.length ? queue : incomingProducts;
  const productCount = products.length;
  const index = clamp(cursor, 0, Math.max(productCount - 1, 0));
  const product = products[index];
  const productId = product?.id;
  const isLiked = product ? liked.includes(product.id) : false;
  const hasProduct = Boolean(product);
  useLayoutEffect(() => {
    session.current.products = products;
    session.current.index = index;
  }, [products, index]);

  useEffect(() => () => {
    window.cancelAnimationFrame(dragFrame.current);
    window.cancelAnimationFrame(nativeScrollFrame.current);
    window.clearTimeout(heartTimer.current);
    window.clearTimeout(boundaryTimer.current);
    window.clearTimeout(exitTimer.current);
    window.clearTimeout(cardClickTimer.current);
    window.clearTimeout(wheelSourceTimer.current);
  }, []);

  useEffect(() => {
    shownAt.current = performance.now();
  }, [productId]);

  const showBoundary = (message) => {
    setBoundaryMessage(message);
    window.clearTimeout(boundaryTimer.current);
    boundaryTimer.current = window.setTimeout(() => setBoundaryMessage(""), 1500);
  };

  const readNativeScroll = useEffectEvent(() => {
    const surface = nativeScrollRef.current;
    if (!surface) return;
    const current = session.current;
    const limitedTop = limitNativeScrollTop(surface.scrollTop, nativeWheelGesture.current, nativePageHeight.current, current.products.length);
    if (Math.abs(limitedTop - surface.scrollTop) > 0.5) surface.scrollTo({ top: limitedTop, behavior: "instant" });
    const nextIndex = scrollPageIndex(limitedTop, nativePageHeight.current, current.products.length);
    if (nativeTarget.current !== null && Math.abs(surface.scrollTop - nativeTarget.current * nativePageHeight.current) < 1) {
      nativeTarget.current = null;
    }
    if (nextIndex === current.index) return;
    const departed = forwardScrollDeparture(current.products, current.index, nextIndex, nativeDepartures.current);
    if (departed) {
      // A single flick may cross multiple pages. Record only the card that was
      // actually active, once, rather than every wheel tick or crossed wrapper.
      nativeDepartures.current.add(departed.id);
      if (!current.exiting && !nativeLikedDepartures.current.has(departed.id)) {
        onSkip?.(departed, { dwellMs: Math.max(0, Math.round(performance.now() - shownAt.current)) });
      }
    }
    current.index = nextIndex;
    current.exiting = null;
    shownAt.current = performance.now();
    visitedThrough.current = Math.max(visitedThrough.current, nextIndex);
    window.clearTimeout(exitTimer.current);
    window.clearTimeout(heartTimer.current);
    setExitSwipe(null);
    setHeartPulse(false);
    setCursor(nextIndex);
  });

  useLayoutEffect(() => {
    const surface = nativeScrollRef.current;
    if (!nativeDesktop || !surface) return;
    const measure = () => {
      const height = surface.clientHeight;
      if (!height || height === nativePageHeight.current) return;
      nativePageHeight.current = height;
      nativeWheelGesture.current = null;
      // Snap wrappers keep explicit, equal heights even though distant cards
      // are empty. Update their geometry before aligning a resized viewport.
      surface.style.setProperty("--scroll-page-height", `${height}px`);
      nativeTarget.current = null;
      surface.scrollTo({ top: scrollPageTop(session.current.index, height, session.current.products.length), behavior: "instant" });
    };
    nativePageHeight.current = 0;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    const onScroll = () => {
      // Also bound native inertia and browser snap animations, which can keep
      // scrolling after the last wheel event has been delivered.
      const limitedTop = limitNativeScrollTop(surface.scrollTop, nativeWheelGesture.current, nativePageHeight.current, session.current.products.length);
      if (Math.abs(limitedTop - surface.scrollTop) > 0.5) surface.scrollTo({ top: limitedTop, behavior: "instant" });
      if (nativeScrollFrame.current) return;
      nativeScrollFrame.current = window.requestAnimationFrame(() => {
        nativeScrollFrame.current = 0;
        readNativeScroll();
      });
    };
    surface.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      surface.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(nativeScrollFrame.current);
      nativeScrollFrame.current = 0;
    };
  }, [nativeDesktop, hasProduct]);

  const moveTo = (nextIndex, { instant = false } = {}) => {
    const current = session.current;
    window.clearTimeout(exitTimer.current);
    current.exiting = null;
    setExitSwipe(null);
    const clamped = clamp(nextIndex, 0, Math.max(0, current.products.length - 1));
    if (nativeDesktop && nativeScrollRef.current) {
      nativeWheelGesture.current = null;
      nativeTarget.current = clamped;
      nativeScrollRef.current.scrollTo({
        top: scrollPageTop(clamped, nativePageHeight.current, current.products.length),
        behavior: instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      });
      setDrag({ axis: "", x: 0, y: 0 });
      if (nextIndex < 0 || nextIndex >= current.products.length) {
        showBoundary(nextIndex < 0 ? "You’re at the first find" : "You’re at the end of this scroll");
      }
      return;
    }
    if (clamped === current.index) {
      showBoundary(nextIndex < 0 ? "You’re at the first find" : "You’re at the end of this scroll");
      return;
    }
    current.index = clamped;
    shownAt.current = performance.now();
    setCursor(clamped);
    visitedThrough.current = Math.max(visitedThrough.current, clamped);
    setHeartPulse(false);
    window.clearTimeout(heartTimer.current);
    setDrag({ axis: "", x: 0, y: 0 });
  };

  const previous = () => moveTo((nativeDesktop ? nativeTarget.current ?? session.current.index : session.current.index) - 1);
  const next = () => {
    const current = session.current;
    if (nativeDesktop) {
      moveTo((nativeTarget.current ?? current.index) + 1);
      return;
    }
    const activeProduct = current.products[current.index];
    if (current.index < current.products.length - 1 && activeProduct && !current.exiting) {
      const startedAt = shownAt.current || performance.now();
      onSkip?.(activeProduct, {
        dwellMs: Math.max(0, Math.round(performance.now() - startedAt)),
      });
    }
    moveTo(current.index + 1);
  };
  const heart = (onlyLike = false) => {
    const current = session.current;
    const activeProduct = current.products[current.index];
    if (!activeProduct || current.exiting) return;
    onHeart(activeProduct, { onlyLike });
    setHeartPulse(true);
    window.clearTimeout(heartTimer.current);
    heartTimer.current = window.setTimeout(() => setHeartPulse(false), 760);
  };

  const swipeHeart = (direction) => {
    const current = session.current;
    const activeProduct = current.products[current.index];
    if (!activeProduct || current.exiting) return;
    if (current.index === current.products.length - 1) {
      heart(true);
      showBoundary("You’re at the end of this scroll");
      return;
    }
    current.exiting = activeProduct.id;
    if (nativeDesktop) nativeLikedDepartures.current.add(activeProduct.id);
    onHeart(activeProduct, { onlyLike: true });
    setHeartPulse(true);
    setExitSwipe({ id: activeProduct.id, direction });
    window.clearTimeout(exitTimer.current);
    exitTimer.current = window.setTimeout(() => {
      // Navigation can interrupt the exit; never advance an unrelated card
      // from an old animation timer or block input for a second transition.
      if (session.current.exiting === activeProduct.id) moveTo(session.current.index + 1, { instant: nativeDesktop });
    }, SWIPE_EXIT_DURATION);
  };

  const rememberImageRatio = (id, event) => {
    const image = event.currentTarget;
    const { naturalWidth, naturalHeight } = image;
    if (!naturalWidth || !naturalHeight) return;
    const ratio = naturalWidth / naturalHeight;
    setImageRatios((ratios) => ratios[id] === ratio ? ratios : { ...ratios, [id]: ratio });
    // The next two cards load eagerly and decode offscreen; navigation never
    // waits for an image request or decode promise to complete.
    image.decode?.().catch(() => {});
  };

  const toggleCardMorph = (id, event) => {
    if (!event.currentTarget || event.target.closest("button, a, [data-scroll-action]")) return;
    if (suppressCardClick.current) return;
    if (hoveredCard?.id === id) {
      setHoveredCard({ ...hoveredCard, active: !hoveredCard.active });
      return;
    }

    const frame = event.currentTarget;
    const bounds = frame.getBoundingClientRect();
    const viewportBounds = viewportRef.current?.getBoundingClientRect();
    if (!viewportBounds) return;
    const isMobile = window.matchMedia("(max-width: 820px)").matches;
    const ratio = imageRatios[id];
    if (!ratio) return;

    const edgePadding = isMobile ? 12 : 24;
    const maxWidth = Math.max(1, viewportBounds.width - edgePadding * 2 - (isMobile ? 0 : 112));
    const maxHeight = Math.max(1, viewportBounds.height - edgePadding * 2);
    const height = Math.min(maxHeight, maxWidth / ratio);
    const width = height * ratio;
    setHoveredCard({ id, width, height, baseWidth: bounds.width, baseHeight: bounds.height, active: true });
  };

  const finishCardMorph = (id, event) => {
    if (event.target !== event.currentTarget || !["width", "height"].includes(event.propertyName)) return;
    setHoveredCard((current) => current?.id === id && !current.active ? null : current);
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0 || !product || event.target.closest("button, a, [data-scroll-action]")) return;
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      axis: "",
      scrollTop: nativeScrollRef.current?.scrollTop || 0,
      pointerType: event.pointerType,
      captured: !nativeDesktop,
    };
    if (nativeDesktop) {
      nativeTarget.current = null;
      nativeWheelGesture.current = null;
    }
    // Preserve ordinary desktop clicks on the photo. Capture only once a drag
    // starts; coarse-pointer gestures retain their existing capture behavior.
    if (!nativeDesktop) event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
  };

  const handlePointerMove = (event) => {
    const start = gesture.current;
    if (!start) return;
    if (shouldCancelMouseDrag(event)) {
      cancelPointer();
      return;
    }
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (!start.axis && Math.max(Math.abs(x), Math.abs(y)) > AXIS_LOCK) {
      if (Math.abs(x) > Math.abs(y) * 1.2) start.axis = "x";
      else if (Math.abs(y) > Math.abs(x) * 1.2) start.axis = "y";
    }
    if (start.axis) {
      if (nativeDesktop && !start.captured) {
        event.currentTarget.setPointerCapture(event.pointerId);
        start.captured = true;
      }
      if (nativeDesktop && start.axis === "y") {
        if (start.pointerType === "mouse" && nativeScrollRef.current) {
          nativeScrollRef.current.dataset.dragging = "true";
          nativeScrollRef.current.scrollTop = start.scrollTop - y;
        }
        return;
      }
      pendingDrag.current = { axis: start.axis, x, y };
      if (!dragFrame.current) {
        dragFrame.current = window.requestAnimationFrame(() => {
          setDrag(pendingDrag.current || { axis: "", x: 0, y: 0 });
          dragFrame.current = 0;
        });
      }
    }
  };

  const finishPointer = (event) => {
    const start = gesture.current;
    gesture.current = null;
    if (!start) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    const axis = start.axis || (Math.abs(x) > Math.abs(y) ? "x" : "y");
    window.cancelAnimationFrame(dragFrame.current);
    dragFrame.current = 0;
    pendingDrag.current = null;
    if (Math.max(Math.abs(x), Math.abs(y)) > AXIS_LOCK) {
      suppressCardClick.current = true;
      window.clearTimeout(cardClickTimer.current);
      cardClickTimer.current = window.setTimeout(() => { suppressCardClick.current = false; }, 0);
    }
    if (axis === "x" && Math.abs(x) > HEART_DISTANCE) {
      swipeHeart(x < 0 ? -1 : 1);
      return;
    }
    setDrag({ axis: "", x: 0, y: 0 });

    if (nativeDesktop && axis === "y") {
      const surface = nativeScrollRef.current;
      if (surface) {
        delete surface.dataset.dragging;
        if (start.pointerType === "mouse") {
          moveTo(scrollPageIndex(surface.scrollTop, nativePageHeight.current, session.current.products.length));
        }
      }
      return;
    }

    const duration = performance.now() - start.time;
    const threshold = Math.max(48, (event.currentTarget.clientHeight || 600) * 0.08);
    const quickFlick = Math.abs(y) >= 28 && duration <= 280;
    if (axis === "y" && (Math.abs(y) > threshold || quickFlick)) {
      if (y < 0) next();
      else previous();
    }
  };

  const cancelPointer = () => {
    if (nativeScrollRef.current) delete nativeScrollRef.current.dataset.dragging;
    gesture.current = null;
    window.cancelAnimationFrame(dragFrame.current);
    dragFrame.current = 0;
    pendingDrag.current = null;
    setDrag({ axis: "", x: 0, y: 0 });
  };

  const resetPointerSession = useEffectEvent(() => {
    cancelPointer();
    nativeWheelGesture.current = null;
    wheelGesture.current = createWheelGesture();
    window.clearTimeout(wheelSourceTimer.current);
    wheelSourceRef.current = null;
    setWheelSourceSlot(null);
  });

  useEffect(() => {
    const reset = () => resetPointerSession();
    window.addEventListener("blur", reset);
    return () => window.removeEventListener("blur", reset);
  }, []);

  const handleWheel = useEffectEvent((event) => {
    if (event.ctrlKey || event.target.closest("input, textarea, select, [contenteditable='true'], [data-scroll-native]")) return;
    if (nativeDesktop && Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
      // Keep native momentum inside a four-product range for this gesture.
      // A new flick after an idle gap starts a fresh range from the current card.
      const surface = nativeScrollRef.current;
      if (!surface || !event.deltaY) return;
      nativeTarget.current = null;
      // Keep Chrome's wheel target mounted until its stream ends. Otherwise
      // virtualization/inert changes can interrupt scrolling mid-gesture.
      const sourceSlot = Number(event.target.closest("[data-scroll-slot]")?.dataset.scrollSlot ?? session.current.index);
      if (wheelSourceRef.current !== sourceSlot) {
        wheelSourceRef.current = sourceSlot;
        setWheelSourceSlot(sourceSlot);
      }
      window.clearTimeout(wheelSourceTimer.current);
      wheelSourceTimer.current = window.setTimeout(() => {
        wheelSourceRef.current = null;
        setWheelSourceSlot(null);
      }, 200);
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.clientHeight : 1;
      nativeWheelGesture.current = updateNativeScrollGesture(nativeWheelGesture.current, {
        now: performance.now(), scrollTop: surface.scrollTop,
        pageHeight: nativePageHeight.current, productCount: session.current.products.length,
        deltaY: event.deltaY * scale,
      });
      const proposedTop = surface.scrollTop + event.deltaY * scale;
      const limitedTop = limitNativeScrollTop(proposedTop, nativeWheelGesture.current, nativePageHeight.current, session.current.products.length);
      if (Math.abs(proposedTop - limitedTop) > 0.5) {
        if (event.cancelable) event.preventDefault();
        // Do not repeatedly restart native scrolling at the same boundary.
        if (Math.abs(surface.scrollTop - limitedTop) > 0.5) surface.scrollTo({ top: limitedTop, behavior: "instant" });
      }
      return;
    }
    if (event.cancelable) event.preventDefault();
    const result = advanceWheelGesture(wheelGesture.current, {
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      now: performance.now(),
      pageHeight: viewportRef.current?.clientHeight || 600,
    });
    wheelGesture.current = result.state;
    if (result.action?.axis === "x") swipeHeart(-result.action.direction);
    else if (result.action?.direction > 0) next();
    else if (result.action) previous();
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const listener = (event) => handleWheel(event);
    // React's delegated wheel listener is passive; this region needs to consume
    // a gesture without also scrolling the surrounding page.
    viewport.addEventListener("wheel", listener, { passive: false });
    return () => viewport.removeEventListener("wheel", listener);
  }, [hasProduct]);

  const handleKeyDown = (event) => {
    if (event.target.closest("button, a, input, textarea, select, [contenteditable='true']")) return;
    if (nativeDesktop && ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) {
      nativeWheelGesture.current = null;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      next();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      previous();
    } else if (event.key.toLowerCase() === "h") {
      event.preventDefault();
      heart();
    }
  };

  if (loading && !product) {
    return <section className={`${styles.empty} ${styles.loading}`} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <p className="shop-kicker">Scroll</p>
      <h1>Finding your next favorite.</h1>
      <p>Loading products from the catalog…</p>
    </section>;
  }

  if (error && !product) {
    return <section className={styles.empty} aria-labelledby="scroll-error-title">
      <Icon name="search" size={30} />
      <p className="shop-kicker">Scroll</p>
      <h1 id="scroll-error-title">The catalog didn’t load.</h1>
      <p>{error}</p>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </section>;
  }

  if (!product) {
    return <section className={styles.empty} aria-labelledby="empty-scroll-title">
      <Icon name="search" size={30} />
      <p className="shop-kicker">Scroll</p>
      <h1 id="empty-scroll-title">No products in the catalog yet.</h1>
      <p>Check back soon for a fresh set of finds.</p>
      {onRetry && <Button onClick={onRetry}>Refresh catalog</Button>}
    </section>;
  }

  // Keep two previous cards mounted while an interrupted transition settles.
  // This avoids an empty strip during quick repeated next gestures.
  const firstVisibleIndex = Math.max(0, index - 2);
  const visibleProducts = products
    .slice(firstVisibleIndex, Math.min(productCount, index + 3))
    .map((item, offset) => ({ item, itemIndex: firstVisibleIndex + offset }));
  const edgeDrag = (index === 0 && drag.y > 0) || (index === productCount - 1 && drag.y < 0);
  const trackOffset = drag.axis === "y" ? drag.y * (edgeDrag ? EDGE_RESISTANCE : 1) : 0;

  return (
    <section
      className={`${styles.experience} ${searchQuery ? styles.searchExperience : ""}`}
      aria-label={searchQuery ? `Products matching ${searchQuery}` : "ShopScroll product feed"}
    >
      {searchQuery && (
        <div className={styles.searchModeBar}>
          <span>Search scroll <strong>“{searchQuery}”</strong></span>
          <Button onClick={onExitSearch} variant="secondary">Back to your feed</Button>
        </div>
      )}
      <Link className={`${styles.budgetBar} ${searchQuery ? styles.searchBudgetBar : ""}`} href="/budget">
        <span>In cart <strong>{formatProductPrice(cartTotal)}</strong></span>
        <span>Budget <strong>{formatProductPrice(budgetLimit)}</strong></span>
        <span className={styles.budgetRemaining}>
          {formatProductPrice(Math.max(budgetLimit - cartTotal, 0))} left
        </span>
        <i aria-hidden="true">
          <b style={{ width: `${Math.min((cartTotal / budgetLimit) * 100, 100)}%` }} />
        </i>
      </Link>
      <div
        aria-label="Product feed. Swipe or scroll vertically for the next item. Swipe sideways or press H to heart."
        className={`${styles.viewport} ${nativeDesktop ? styles.desktopViewport : ""} ${drag.axis ? styles.dragging : ""}`}
        onKeyDown={handleKeyDown}
        onPointerCancel={cancelPointer}
        onLostPointerCapture={cancelPointer}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        ref={viewportRef}
        role="region"
        tabIndex={0}
      >
        <div aria-label={nativeDesktop ? "Scrollable products" : undefined} className={nativeDesktop ? styles.nativeSurface : styles.touchSurface} ref={nativeScrollRef} role={nativeDesktop ? "region" : undefined} tabIndex={nativeDesktop ? 0 : undefined}>
          <div
            className={nativeDesktop ? styles.nativeTrack : `${styles.track} ${drag.axis === "y" ? styles.trackDragging : ""}`}
            style={nativeDesktop ? undefined : { transform: `translate3d(0, calc(${-index * 100}% + ${trackOffset}px), 0)` }}
          >
          {(nativeDesktop ? products.map((item, itemIndex) => ({ item, itemIndex })) : visibleProducts).map(({ item, itemIndex }) => {
            // Native snap targets belong to positions, not product IDs: a feed
            // re-ranking must not move the DOM element the browser snapped to.
            if (nativeDesktop && Math.abs(itemIndex - index) > 2 && itemIndex !== wheelSourceSlot) {
              return <div aria-hidden="true" className={`${styles.reel} ${styles.nativeReel}`} key={itemIndex} />;
            }
            const selected = itemIndex === index;
            const exiting = exitSwipe?.id === item.id;
            const cardMorph = hoveredCard?.id === item.id ? hoveredCard : null;
            const reviewCount = Number.isInteger(item.reviews) && item.reviews > 0 ? item.reviews : 0;
            const rating = Number.isFinite(item.rating) ? item.rating.toFixed(1) : null;
            const priceLabel = formatProductPrice(item.price);
            const likedItem = liked.includes(item.id);
            const savedItem = saved.includes(item.id);
            const horizontalOffset = selected && drag.axis === "x" ? drag.x * 0.62 : 0;
            const rotation = selected && drag.axis === "x" ? drag.x / 45 : 0;
            const badgeProgress = selected && drag.axis === "x" ? clamp(Math.abs(drag.x) / HEART_DISTANCE, 0, 1) : 0;

            return (
              <div aria-hidden={!selected} className={`${styles.reel} ${nativeDesktop ? styles.nativeReel : ""}`} inert={!nativeDesktop && !selected} data-scroll-slot={itemIndex} key={nativeDesktop ? itemIndex : item.id} style={nativeDesktop ? undefined : { top: `${itemIndex * 100}%` }}>
                <div
                  className={styles.frame}
                  onClick={(event) => selected && toggleCardMorph(item.id, event)}
                  onTransitionEnd={(event) => finishCardMorph(item.id, event)}
                  style={cardMorph ? {
                    width: `${cardMorph.active ? cardMorph.width : cardMorph.baseWidth}px`,
                    height: `${cardMorph.active ? cardMorph.height : cardMorph.baseHeight}px`,
                  } : undefined}
                >

                  <article
                    aria-label={`${item.name}, ${priceLabel}`}
                    className={`${styles.card} ${cardMorph?.active ? styles.cardExpanded : ""} ${selected && drag.axis === "x" && !exiting ? styles.cardDragging : ""} ${exiting ? styles.cardExiting : ""} ${selected && heartPulse ? styles.cardPop : ""}`}
                    onDoubleClick={(event) => {
                      if (selected && !event.target.closest("button, a")) heart(true);
                    }}
                    style={{
                      transform: exiting
                        ? `translate3d(calc(${exitSwipe.direction * 100}vw + ${exitSwipe.direction * 120}px), 0, 0) rotate(${exitSwipe.direction * 16}deg)`
                        : selected && drag.axis === "x" ? `translate3d(${horizontalOffset}px, 0, 0) rotate(${rotation}deg)` : "",
                      opacity: exiting ? 0 : 1,
                    }}
                  >
                    <ProductImage alt={item.name} className={styles.image} decoding="async" fetchPriority={selected ? "high" : itemIndex === index + 1 ? "auto" : "low"} loading="eager" onLoad={(event) => rememberImageRatio(item.id, event)} src={item.image} />
                    <div className={styles.scrim} />
                    <div className={styles.top}>
                      {/* <span className={styles.chip}>{item.category}</span>
                      <span className={styles.counter} aria-label={`Product ${index + 1} of ${productCount}`}>
                        <b>{String(index + 1).padStart(2, "0")}</b><i aria-hidden="true">/</i>{productCount}
                      </span> */}
                    </div>
                    <div className={styles.info}>
                      <p>{item.title}</p>
                      <div className={styles.meta}>
                        <span>{rating && <Icon filled name="star" size={15} />} <b>{rating || "New"}</b>{reviewCount ? ` (${reviewCount.toLocaleString()})` : " · No reviews"}</span>
                        <button tabIndex={selected ? 0 : -1} type="button" data-scroll-action onClick={() => onDetails(item, "details")}>View details <Icon name="arrowRight" size={15} /></button>
                      </div>
                    </div>
                    <div className={styles.badge} style={{ opacity: badgeProgress, transform: `translate(-50%, -50%) scale(${0.4 + badgeProgress * 0.6})` }} aria-hidden="true">
                      <Icon filled name="heart" size={46} />
                    </div>
                  </article>

                  <div className={styles.rail} aria-label="Product actions" role="group">
                    <button className={`${styles.action} ${likedItem ? styles.actionOn : ""}`} type="button" tabIndex={selected ? 0 : -1} aria-label={likedItem ? `Unheart ${item.name}` : `Heart ${item.name}`} aria-pressed={likedItem} onClick={() => selected ? heart() : onHeart(item)}>
                      <Icon filled={likedItem} name="heart" size={25} />
                      <span>{likedItem ? "Hearted" : "Heart"}</span>
                    </button>
                    <button className={styles.action} type="button" tabIndex={selected ? 0 : -1} aria-label={`Share ${item.name}`} onClick={() => onShare(item)}>
                      <Icon name="share" size={24} />
                      <span>Share</span>
                    </button>
                    <button className={`${styles.action} ${savedItem ? styles.actionSaved : ""}`} type="button" tabIndex={selected ? 0 : -1} aria-label={savedItem ? `Edit ${item.name} collections` : `Save ${item.name} to a collection`} aria-pressed={savedItem} onClick={() => onSave(item)}>
                      <Icon filled={savedItem} name="bookmark" size={23} />
                      <span>{savedItem ? "Saved" : "Save"}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>

        <div className={styles.nav}>
          <Button aria-label="Previous product" disabled={index === 0} onClick={previous} variant="icon"><Icon name="chevronUp" size={20} /></Button>
          <Button aria-label="Next product" disabled={index === productCount - 1} onClick={next} variant="icon"><Icon name="chevronDown" size={20} /></Button>
        </div>
        {boundaryMessage && <p className={styles.boundary} role="status">{boundaryMessage}</p>}
        <p className={styles.srOnly} aria-live="polite">Product {index + 1} of {productCount}: {product.name}{isLiked ? ", hearted" : ""}</p>
      </div>
    </section>
  );
}
