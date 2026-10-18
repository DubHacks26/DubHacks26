"use client";

import { useEffect, useRef, useState } from "react";
import { productChips } from "@/utils/feed.mjs";
import { formatProductPrice } from "@/utils/catalogProduct.mjs";
import { appendToScrollQueue } from "@/utils/scroll-queue.mjs";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import styles from "./product-scroll.module.css";

const AXIS_LOCK = 12;
const HEART_DISTANCE = 90;
const HORIZONTAL_WHEEL_DISTANCE = 180;
const PAGE_TRANSITION_DURATION = 420;
const WHEEL_IDLE_DELAY = 140;
const EDGE_RESISTANCE = 0.24;
const SWIPE_EXIT_DURATION = 380;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function titleCase(value) {
  return String(value).replace(/[_-]+/g, " ").replace(/(^|\s)\w/g, letter => letter.toUpperCase());
}

function scheduleWheelUnlock(timer, lockUntil, lastAt, lock) {
  window.clearTimeout(timer.current);
  const now = performance.now();
  const untilAnimationEnds = Math.max(0, lockUntil.current - now);
  const untilGestureEnds = Math.max(0, WHEEL_IDLE_DELAY - (now - lastAt.current));
  timer.current = window.setTimeout(() => {
    const currentTime = performance.now();
    if (currentTime < lockUntil.current || currentTime - lastAt.current < WHEEL_IDLE_DELAY) {
      scheduleWheelUnlock(timer, lockUntil, lastAt, lock);
    } else {
      lock.current = false;
    }
  }, Math.max(untilAnimationEnds, untilGestureEnds));
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
}) {
  const [queue, setQueue] = useState(() => incomingProducts);
  const [cursor, setCursor] = useState(0);
  const [drag, setDrag] = useState({ axis: "", x: 0, y: 0 });
  const [heartPulse, setHeartPulse] = useState(false);
  const [exitSwipe, setExitSwipe] = useState(null);
  const [imageRatios, setImageRatios] = useState({});
  const [hoveredCard, setHoveredCard] = useState(null);
  const [boundaryMessage, setBoundaryMessage] = useState("");
  const gesture = useRef(null);
  const wheelLock = useRef(false);
  const wheelLockUntil = useRef(0);
  const wheelLastAt = useRef(0);
  const wheelX = useRef(0);
  const wheelXTimer = useRef(null);
  const wheelUnlockTimer = useRef(null);
  const heartTimer = useRef(null);
  const boundaryTimer = useRef(null);
  const exitTimer = useRef(null);
  const cardClickTimer = useRef(null);
  const suppressCardClick = useRef(false);
  const viewportRef = useRef(null);
  const pendingDrag = useRef(null);
  const dragFrame = useRef(0);
  const shownAt = useRef(0);

  useEffect(() => {
    let active = true;
    // The recommendation request may resolve while a card is visible. Append
    // its new candidates instead of replacing or reordering that card's queue.
    Promise.resolve().then(() => {
      if (active) setQueue(queue => appendToScrollQueue(queue, incomingProducts));
    });
    return () => {
      active = false;
    };
  }, [incomingProducts]);

  // Render the first server-loaded batch immediately; later batches enter via
  // the stable queue above.
  const products = queue.length ? queue : incomingProducts;
  const productCount = products.length;
  const index = clamp(cursor, 0, Math.max(productCount - 1, 0));
  const product = products[index];
  const productId = product?.id;
  const isLiked = product ? liked.includes(product.id) : false;
  useEffect(() => () => {
    window.cancelAnimationFrame(dragFrame.current);
    window.clearTimeout(wheelXTimer.current);
    window.clearTimeout(wheelUnlockTimer.current);
    window.clearTimeout(heartTimer.current);
    window.clearTimeout(boundaryTimer.current);
    window.clearTimeout(exitTimer.current);
    window.clearTimeout(cardClickTimer.current);
  }, []);

  useEffect(() => {
    shownAt.current = performance.now();
  }, [productId]);

  const showBoundary = (message) => {
    setBoundaryMessage(message);
    window.clearTimeout(boundaryTimer.current);
    boundaryTimer.current = window.setTimeout(() => setBoundaryMessage(""), 1500);
  };

  const moveTo = (nextIndex) => {
    if (exitSwipe) setExitSwipe(null);
    const clamped = clamp(nextIndex, 0, productCount - 1);
    if (clamped === index) {
      showBoundary(nextIndex < 0 ? "You’re at the first find" : "You’re at the end of this scroll");
      return;
    }
    setCursor(clamped);
    setDrag({ axis: "", x: 0, y: 0 });
  };

  const previous = () => moveTo(index - 1);
  const next = () => {
    if (index < productCount - 1 && product) {
      const startedAt = shownAt.current || performance.now();
      onSkip?.(product, {
        dwellMs: Math.max(0, Math.round(performance.now() - startedAt)),
      });
    }
    moveTo(index + 1);
  };
  const heart = () => {
    if (!product || exitSwipe) return;
    onHeart(product);
    setHeartPulse(true);
    window.clearTimeout(heartTimer.current);
    heartTimer.current = window.setTimeout(() => setHeartPulse(false), 760);
  };

  const swipeHeart = (direction) => {
    if (!product || exitSwipe) return;
    if (index === productCount - 1) {
      heart();
      showBoundary("You’re at the end of this scroll");
      return;
    }
    onHeart(product);
    setHeartPulse(true);
    setExitSwipe({ id: product.id, direction });
    window.clearTimeout(exitTimer.current);
    exitTimer.current = window.setTimeout(() => {
      setDrag({ axis: "", x: 0, y: 0 });
      setHeartPulse(false);
      setCursor(index + 1);
      window.clearTimeout(exitTimer.current);
      exitTimer.current = window.setTimeout(() => setExitSwipe(null), PAGE_TRANSITION_DURATION);
    }, SWIPE_EXIT_DURATION);
  };

  const rememberImageRatio = (id, event) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (!naturalWidth || !naturalHeight) return;
    const ratio = naturalWidth / naturalHeight;
    setImageRatios((ratios) => ratios[id] === ratio ? ratios : { ...ratios, [id]: ratio });
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
    if (event.button !== 0 || !product || exitSwipe || event.target.closest("button, a, [data-scroll-action]")) return;
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      axis: "",
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
  };

  const handlePointerMove = (event) => {
    const start = gesture.current;
    if (!start) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (!start.axis && Math.max(Math.abs(x), Math.abs(y)) > AXIS_LOCK) {
      if (Math.abs(x) > Math.abs(y) * 1.2) start.axis = "x";
      else if (Math.abs(y) > Math.abs(x) * 1.2) start.axis = "y";
    }
    if (start.axis) {
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

    const duration = performance.now() - start.time;
    const threshold = Math.max(48, (event.currentTarget.clientHeight || 600) * 0.08);
    const quickFlick = Math.abs(y) >= 28 && duration <= 280;
    if (axis === "y" && (Math.abs(y) > threshold || quickFlick)) {
      if (y < 0) next();
      else previous();
    }
  };

  const cancelPointer = () => {
    gesture.current = null;
    window.cancelAnimationFrame(dragFrame.current);
    dragFrame.current = 0;
    pendingDrag.current = null;
    setDrag({ axis: "", x: 0, y: 0 });
  };

  const handleWheel = (event) => {
    if (exitSwipe || event.target.closest("button, a, input, textarea, select, [data-scroll-action]")) return;
    const { deltaX, deltaY } = event;
    const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
    event.preventDefault();
    if (horizontal) {
      wheelX.current += Math.abs(deltaX);
      window.clearTimeout(wheelXTimer.current);
      wheelXTimer.current = window.setTimeout(() => { wheelX.current = 0; }, 200);
      if (wheelX.current >= HORIZONTAL_WHEEL_DISTANCE) {
        wheelX.current = -Infinity;
        swipeHeart(deltaX > 0 ? -1 : 1);
      }
      return;
    }

    if (Math.abs(deltaY) < 6) return;
    const now = performance.now();
    if (wheelLock.current) {
      wheelLastAt.current = now;
      scheduleWheelUnlock(wheelUnlockTimer, wheelLockUntil, wheelLastAt, wheelLock);
      return;
    }
    wheelLock.current = true;
    wheelLockUntil.current = now + PAGE_TRANSITION_DURATION;
    wheelLastAt.current = now;
    if (deltaY > 0) next();
    else previous();
    scheduleWheelUnlock(wheelUnlockTimer, wheelLockUntil, wheelLastAt, wheelLock);
  };

  const handleKeyDown = (event) => {
    if (event.target.closest("button, a, input, textarea, select, [contenteditable='true']")) return;
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

  if (loading) {
    return <section className={`${styles.empty} ${styles.loading}`} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <p className="shop-kicker">Scroll</p>
      <h1>Finding your next favorite.</h1>
      <p>Loading products from the catalog…</p>
    </section>;
  }

  if (error) {
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

  const firstVisibleIndex = Math.max(0, index - 1);
  const visibleProducts = products
    .slice(firstVisibleIndex, Math.min(productCount, index + 2))
    .map((item, offset) => ({ item, itemIndex: firstVisibleIndex + offset }));
  const edgeDrag = (index === 0 && drag.y > 0) || (index === productCount - 1 && drag.y < 0);
  const trackOffset = drag.axis === "y" ? drag.y * (edgeDrag ? EDGE_RESISTANCE : 1) : 0;

  return (
    <section className={styles.experience} aria-label="ShopScroll product feed">
      <div
        aria-label="Product feed. Swipe or scroll vertically for the next item. Swipe sideways or press H to heart."
        className={`${styles.viewport} ${drag.axis ? styles.dragging : ""}`}
        onKeyDown={handleKeyDown}
        onPointerCancel={cancelPointer}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onWheel={handleWheel}
        ref={viewportRef}
        role="region"
        tabIndex={0}
      >
        <div
          className={`${styles.track} ${drag.axis === "y" ? styles.trackDragging : ""}`}
          style={{ transform: `translate3d(0, calc(${-index * 100}% + ${trackOffset}px), 0)` }}
        >
          {visibleProducts.map(({ item, itemIndex }) => {
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
              <div aria-hidden={!selected} className={styles.reel} inert={!selected} key={item.id} style={{ top: `${itemIndex * 100}%` }}>
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
                      if (selected && !event.target.closest("button, a")) heart();
                    }}
                    style={{
                      transform: exiting
                        ? `translate3d(calc(${exitSwipe.direction * 100}vw + ${exitSwipe.direction * 120}px), 0, 0) rotate(${exitSwipe.direction * 16}deg)`
                        : selected && drag.axis === "x" ? `translate3d(${horizontalOffset}px, 0, 0) rotate(${rotation}deg)` : "",
                      opacity: exiting ? 0 : 1,
                    }}
                  >
                    <ProductImage alt={item.name} className={`${styles.image} ${styles.imageCover}`} onLoad={(event) => rememberImageRatio(item.id, event)} src={item.image} />
                    <ProductImage alt="" aria-hidden="true" className={`${styles.image} ${styles.imageFull}`} src={item.image} />
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
                        <button type="button" data-scroll-action onClick={() => onDetails(item, "details")}>View details <Icon name="arrowRight" size={15} /></button>
                      </div>
                    </div>
                    <div className={styles.badge} style={{ opacity: badgeProgress, transform: `translate(-50%, -50%) scale(${0.4 + badgeProgress * 0.6})` }} aria-hidden="true">
                      <Icon filled name="heart" size={46} />
                    </div>
                  </article>

                  <div className={styles.rail} aria-label="Product actions" role="group">
                    <button className={`${styles.action} ${likedItem ? styles.actionOn : ""}`} type="button" aria-label={likedItem ? `Unheart ${item.name}` : `Heart ${item.name}`} aria-pressed={likedItem} onClick={() => selected ? heart() : onHeart(item)}>
                      <Icon filled={likedItem} name="heart" size={25} />
                      <span>{likedItem ? "Hearted" : "Heart"}</span>
                    </button>
                    <button className={styles.action} type="button" aria-label={`Share ${item.name}`} onClick={() => onShare(item)}>
                      <Icon name="share" size={24} />
                      <span>Share</span>
                    </button>
                    <button className={`${styles.action} ${savedItem ? styles.actionSaved : ""}`} type="button" aria-label={savedItem ? `Edit ${item.name} collections` : `Save ${item.name} to a collection`} aria-pressed={savedItem} onClick={() => onSave(item)}>
                      <Icon filled={savedItem} name="bookmark" size={23} />
                      <span>{savedItem ? "Saved" : "Save"}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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
