"use client";

import { useEffect, useRef, useState } from "react";
import { productChips } from "@/utils/feed.mjs";
import { formatProductPrice } from "@/utils/catalogProduct.mjs";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import styles from "./product-scroll.module.css";

const AXIS_LOCK = 8;
const HEART_DISTANCE = 90;
const WHEEL_DISTANCE = 150;
const EDGE_RESISTANCE = 0.24;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function titleCase(value) {
  return String(value).replace(/[_-]+/g, " ").replace(/(^|\s)\w/g, letter => letter.toUpperCase());
}

export default function ProductScroll({
  products,
  liked,
  saved,
  onDetails,
  onHeart,
  onSave,
  onShare,
  loading = false,
  error = "",
  onRetry,
}) {
  const [cursor, setCursor] = useState(0);
  const [drag, setDrag] = useState({ axis: "", x: 0, y: 0 });
  const [heartPulse, setHeartPulse] = useState(false);
  const [boundaryMessage, setBoundaryMessage] = useState("");
  const gesture = useRef(null);
  const wheelLock = useRef(false);
  const wheelX = useRef(0);
  const wheelXTimer = useRef(null);
  const wheelUnlockTimer = useRef(null);
  const heartTimer = useRef(null);
  const boundaryTimer = useRef(null);
  const productCount = products.length;
  const index = clamp(cursor, 0, Math.max(productCount - 1, 0));
  const product = products[index];
  const isLiked = product ? liked.includes(product.id) : false;
  useEffect(() => () => {
    window.clearTimeout(wheelXTimer.current);
    window.clearTimeout(wheelUnlockTimer.current);
    window.clearTimeout(heartTimer.current);
    window.clearTimeout(boundaryTimer.current);
  }, []);

  const showBoundary = (message) => {
    setBoundaryMessage(message);
    window.clearTimeout(boundaryTimer.current);
    boundaryTimer.current = window.setTimeout(() => setBoundaryMessage(""), 1500);
  };

  const moveTo = (nextIndex) => {
    const clamped = clamp(nextIndex, 0, productCount - 1);
    if (clamped === index) {
      showBoundary(nextIndex < 0 ? "You’re at the first find" : "You’re at the end of this scroll");
      return;
    }
    setCursor(clamped);
    setDrag({ axis: "", x: 0, y: 0 });
  };

  const previous = () => moveTo(index - 1);
  const next = () => moveTo(index + 1);
  const heart = () => {
    if (!product) return;
    onHeart(product);
    setHeartPulse(true);
    window.clearTimeout(heartTimer.current);
    heartTimer.current = window.setTimeout(() => setHeartPulse(false), 760);
  };

  const handlePointerDown = (event) => {
    if (!product || event.target.closest("button, a, [data-scroll-action]")) return;
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
      start.axis = Math.abs(x) > Math.abs(y) ? "x" : "y";
    }
    if (start.axis) setDrag({ axis: start.axis, x, y });
  };

  const finishPointer = (event) => {
    const start = gesture.current;
    gesture.current = null;
    if (!start) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    const elapsed = Math.max(performance.now() - start.time, 1);
    const axis = start.axis || (Math.abs(x) > Math.abs(y) ? "x" : "y");
    setDrag({ axis: "", x: 0, y: 0 });

    if (axis === "x" && (Math.abs(x) > HEART_DISTANCE || (Math.abs(x) > 38 && Math.abs(x) / elapsed > 0.62))) {
      heart();
      return;
    }

    const threshold = Math.max(54, (event.currentTarget.clientHeight || 600) * 0.14);
    if (axis === "y" && (Math.abs(y) > threshold || (Math.abs(y) > 38 && Math.abs(y) / elapsed > 0.58))) {
      if (y < 0) next();
      else previous();
    }
  };

  const cancelPointer = () => {
    gesture.current = null;
    setDrag({ axis: "", x: 0, y: 0 });
  };

  const handleWheel = (event) => {
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (horizontal) {
      wheelX.current += Math.abs(event.deltaX);
      window.clearTimeout(wheelXTimer.current);
      wheelXTimer.current = window.setTimeout(() => { wheelX.current = 0; }, 180);
      if (!wheelLock.current && wheelX.current >= WHEEL_DISTANCE) {
        wheelX.current = 0;
        wheelLock.current = true;
        heart();
        wheelUnlockTimer.current = window.setTimeout(() => { wheelLock.current = false; }, 500);
      }
      return;
    }
    if (wheelLock.current || Math.abs(event.deltaY) < 8) return;
    wheelLock.current = true;
    if (event.deltaY > 0) next();
    else previous();
    window.clearTimeout(wheelUnlockTimer.current);
    wheelUnlockTimer.current = window.setTimeout(() => { wheelLock.current = false; }, 620);
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

  const visibleProducts = products
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter(({ itemIndex }) => Math.abs(itemIndex - index) <= 1);
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
        role="region"
        tabIndex={0}
      >
        <div
          className={`${styles.track} ${drag.axis === "y" ? styles.trackDragging : ""}`}
          style={{ transform: `translate3d(0, calc(${-index * 100}% + ${trackOffset}px), 0)` }}
        >
          {visibleProducts.map(({ item, itemIndex }) => {
            const selected = itemIndex === index;
            const brand = item.brand || "Independent brand";
            const reviewCount = Number.isInteger(item.reviews) && item.reviews > 0 ? item.reviews : 0;
            const rating = Number.isFinite(item.rating) ? item.rating.toFixed(1) : null;
            const priceLabel = formatProductPrice(item.price);
            const likedItem = liked.includes(item.id);
            const savedItem = saved.includes(item.id);
            const horizontalOffset = selected && drag.axis === "x" ? drag.x * 0.62 : 0;
            const rotation = selected && drag.axis === "x" ? drag.x / 45 : 0;
            const badgeProgress = selected && drag.axis === "x" ? clamp(Math.abs(drag.x) / HEART_DISTANCE, 0, 1) : 0;
            const itemTags = [...(item.styles || []), ...(item.colors || [])].slice(0, 3);
            const catalogTags = (item.tags || []).slice(0, 2).map(titleCase);
            const itemContextTags = [...new Set([...productChips(item), ...itemTags.map(titleCase), ...catalogTags])].slice(0, 4);

            return (
              <div aria-hidden={!selected} className={styles.reel} inert={!selected} key={item.id} style={{ top: `${itemIndex * 100}%` }}>
                <div className={styles.frame}>
                  <aside className={styles.out} aria-label={`${brand} product tags`}>
                    <div className={styles.who}>
                      <span className={styles.avatar} aria-hidden="true">{brand.slice(0, 1).toUpperCase()}</span>
                      <span>{brand}</span>
                    </div>
                    <p className={styles.tags}>{itemContextTags.join(" · ")}</p>
                  </aside>

                  <article
                    aria-label={`${item.name}, ${priceLabel}`}
                    className={`${styles.card} ${selected && drag.axis === "x" ? styles.cardDragging : ""} ${selected && heartPulse ? styles.cardPop : ""}`}
                    onDoubleClick={(event) => {
                      if (selected && !event.target.closest("button, a")) heart();
                    }}
                    style={{ transform: selected && drag.axis === "x" ? `translate3d(${horizontalOffset}px, 0, 0) rotate(${rotation}deg)` : "" }}
                  >
                    <ProductImage alt={item.name} className={styles.image} src={item.image} />
                    <div className={styles.scrim} />
                    <div className={styles.top}>
                      <span className={styles.chip}>{item.category}</span>
                      <span className={styles.counter} aria-label={`Product ${index + 1} of ${productCount}`}>
                        <b>{String(index + 1).padStart(2, "0")}</b><i aria-hidden="true">/</i>{productCount}
                      </span>
                    </div>
                    <div className={styles.info}>
                      <div className={styles.inBrand}>
                        <span className={styles.thumb} aria-hidden="true">{brand.slice(0, 1).toUpperCase()}</span>
                        {brand}
                      </div>
                      <div className={styles.row}>
                        <h1>{item.name}</h1>
                        <span className={styles.price}>{priceLabel}</span>
                      </div>
                      <p>{item.description}</p>
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
                    <button className={styles.action} type="button" aria-label={`View ${reviewCount.toLocaleString()} reviews for ${item.name}`} onClick={() => onDetails(item, "reviews")}>
                      <Icon name="message" size={24} />
                      <span>{reviewCount.toLocaleString()}</span>
                    </button>
                    <button className={styles.action} type="button" aria-label={`Share ${item.name}`} onClick={() => onShare(item)}>
                      <Icon name="share" size={24} />
                      <span>Share</span>
                    </button>
                    <button className={`${styles.action} ${savedItem ? styles.actionSaved : ""}`} type="button" aria-label={savedItem ? `Remove ${item.name} from saved` : `Save ${item.name}`} aria-pressed={savedItem} onClick={() => onSave(item)}>
                      <Icon filled={savedItem} name="bookmark" size={23} />
                      <span>Save</span>
                    </button>
                    <button className={styles.action} type="button" aria-label={`More about ${item.name}`} onClick={() => onDetails(item, "details")}>
                      <Icon name="more" size={24} />
                      <span>More</span>
                    </button>
                    <span className={styles.brandThumb} aria-hidden="true">{brand.slice(0, 1).toUpperCase()}</span>
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
