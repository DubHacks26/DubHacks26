"use client";

import { useEffect, useRef, useState } from "react";
import { explainProduct, productChips } from "@/utils/feed.mjs";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import DiscoverInsights from "@/components/discover-insights/discover-insights";
import styles from "./discover.module.css";

export default function Discover({ products, product, nextProduct, profile, noMatches, canUndo, onTune, onFeedback, onRevisit, onReset, onDetails, onNavigate, onSave, onShare, onSwipe, onUndo, saved }) {
  const gesture = useRef(null);
  // motion is "" | "skip" | "like"
  const [motion, setMotion] = useState("");
  useEffect(() => {
    if (!motion) return;
    const timer = window.setTimeout(() => { onSwipe(motion); setMotion(""); }, 260);
    return () => window.clearTimeout(timer);
  }, [motion, onSwipe]);
  const swipe = direction => { if (product && !motion) setMotion(direction); };
  const goBack = () => { if (canUndo && !motion) onUndo(); };
  useEffect(() => {
    const handleKey = event => {
      if (document.querySelector('dialog[open], [role="dialog"]') || event.target.closest?.('input, textarea, button, select, summary, [contenteditable]')) return;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        if (event.key === "ArrowUp") swipe("skip"); // up: next card
        else goBack();                               // down: previous card (undo)
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });
  const isSaved = product && saved.includes(product.id);
  return <div className={styles.grid}>
    <section className={styles.feed}>
      <header className={styles.heading}>
        <div><p className="shop-kicker">Curated for you</p><h1>Today&apos;s finds</h1></div>
        <Button onClick={onTune} variant="secondary"><Icon name="sparkles" size={16} /> Tune my feed</Button>
      </header>
      {!product ? <div className={styles.empty} role="status">
        <Icon name={noMatches ? "search" : "check"} size={32} />
        <h2>{noMatches ? "No finds match just yet." : "You’re all caught up."}</h2>
        <p>{noMatches ? "No products are available in the catalog yet. Try refreshing in a moment." : "You’ve seen every find in this round. Revisit them to start a new scroll."}</p>
        <Button onClick={onTune}>Adjust preferences</Button>
        <Button variant="secondary" onClick={noMatches ? onReset : onRevisit}>{noMatches ? "Reset filters" : "Revisit finds"}</Button>
        {canUndo && <Button variant="ghost" onClick={onUndo}>Undo last action</Button>}
      </div> : <>
        <div className={styles.stage}>
          {nextProduct && <div className={`${styles.card} ${styles.behind}`}><ProductImage alt="" src={nextProduct.image} /></div>}
          <article key={product.id} className={`${styles.card} ${motion ? styles[`swipe${motion}`] : ""}`}>
            <div className={styles.imageWrap}
              onPointerDown={event => {
                gesture.current = { x: event.clientX, y: event.clientY };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerCancel={() => { gesture.current = null; }}
              onPointerUp={event => {
                const start = gesture.current; gesture.current = null;
                if (!start) return;
                const dx = event.clientX - start.x, dy = event.clientY - start.y;
                if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx) * 1.5) {
                  if (dy < 0) swipe("skip"); // swiped up: next card
                  else goBack();             // swiped down: previous card (undo)
                }
              }}>

              <ProductImage alt={product.name} src={product.image} />
              <span className={styles.category}>{product.category}</span>
              {motion && <div className={`${styles.stamp} ${styles[motion]}`}><Icon name={motion === "like" ? "heart" : "x"} />{motion === "like" ? "Liked" : "Skipped"}</div>}
            </div>
            <div className={styles.copy}>
              <div className={styles.brandRow}><span>{product.brand}</span><button type="button" disabled={Boolean(motion)} aria-label={`${isSaved ? "Unsave" : "Save"} ${product.name}`} aria-pressed={isSaved} className={isSaved ? styles.saved : ""} onClick={() => onSave(product)}><Icon filled={isSaved} name="bookmark" size={19} /></button></div>
              <h2>{product.name}</h2>
              <div className={styles.rating}><strong>${product.price}</strong><span><Icon filled name="star" size={14} />{product.rating} <small>({product.reviews.toLocaleString()})</small></span></div>
              <div className={styles.tags}>{productChips(product).map(tag => <span key={tag}>{tag}</span>)}</div>
              <p>{product.description}</p>
              <details className={styles.why}><summary>Why am I seeing this?</summary><p>{explainProduct(product, profile, products)}</p></details>
              <div className={styles.links}><Button onClick={() => onDetails(product, "details")} variant="ghost">Product details <Icon name="chevronRight" size={15} /></Button><Button onClick={() => onDetails(product, "reviews")} variant="ghost">Reviews</Button></div>
            </div>
          </article>
        </div>
        <div className={styles.controls}>
          <Button aria-label="Undo last feed action" disabled={!canUndo || Boolean(motion)} onClick={onUndo} variant="icon"><Icon name="rotate" size={18} /></Button>
          <Button aria-label="Skip product" disabled={Boolean(motion)} className={styles.nope} onClick={() => swipe("skip")} variant="icon"><Icon name="x" size={27} /></Button>
          <Button aria-label="Like product, show more like this" disabled={Boolean(motion)} className={styles.love} onClick={() => swipe("like")} variant="icon"><Icon filled name="heart" size={26} /></Button>
          <Button aria-label={isSaved ? "Remove from wishlist" : "Save to wishlist"} aria-pressed={isSaved} disabled={Boolean(motion)} onClick={() => onSave(product)} variant="icon"><Icon filled={isSaved} name="bookmark" size={18} /></Button>
          <Button aria-label="Share product" disabled={Boolean(motion)} onClick={() => onShare(product)} variant="icon"><Icon name="share" size={18} /></Button>
        </div>
        <p className={styles.hint}><span>↑</span> Skip <span>↓</span> Back · Heart to like</p>
        <details key={`feedback-${product.id}`} className={styles.feedback}><summary>Give feedback</summary><div>
          {[['price', 'Too expensive'], ['category', 'Less from this category']].map(([reason, label]) => <Button key={reason} variant="secondary" disabled={Boolean(motion)} onClick={() => onFeedback(reason)}>{label}</Button>)}
        </div><p>Feedback adjusts ranking. Your chosen filters stay the same.</p></details>
      </>}
    </section>
    <DiscoverInsights onNavigate={onNavigate} products={products} saved={saved} profile={profile} onTune={onTune} />
  </div>;
}
