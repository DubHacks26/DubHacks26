"use client";

import { useEffect, useRef, useState } from "react";
import { explainProduct, productChips } from "@/utils/feed.mjs";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import DiscoverInsights from "@/components/discover-insights/discover-insights";
import styles from "./discover.module.css";

export default function Discover({ products, product, nextProduct, profile, noMatches, canUndo, onTune, onRevisit, onReset, onDetails, onNavigate, onSave, onShare, onSwipe, onUndo, saved, cart = [], cartLoading = false, onCart, onRemoveFromCart, onBudget }) {
  const gesture = useRef(null);
  const shownAt = useRef(0);
  const pendingInteraction = useRef(null);
  const productId = product?.id;
  // motion is "" | "skip" | "like"
  const [motion, setMotion] = useState("");
  useEffect(() => {
    shownAt.current = performance.now();
    pendingInteraction.current = null;
  }, [productId]);
  useEffect(() => {
    if (!motion) return;
    const interaction = pendingInteraction.current;
    const timer = window.setTimeout(() => {
      pendingInteraction.current = null;
      onSwipe(motion, interaction);
      setMotion("");
    }, 260);
    return () => window.clearTimeout(timer);
  }, [motion, onSwipe]);
  const swipe = direction => {
    if (!product || motion) return;
    if (direction === "skip") {
      const startedAt = shownAt.current || performance.now();
      pendingInteraction.current = {
        dwellMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    } else {
      pendingInteraction.current = null;
    }
    setMotion(direction);
  };
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
  const savedProducts = products.filter(item => saved.includes(item.id));
  const cartSpend = cart.reduce((total, item) => total + Number(item.price || 0), 0);
  const wishlistSpend = savedProducts.reduce((total, item) => total + Number(item.price || 0), 0);
  const plannedSpend = cartSpend + wishlistSpend;
  const categorySpend = [...cart, ...savedProducts].reduce((totals, item) => {
    const category = item.category || "Other";
    totals[category] = (totals[category] || 0) + Number(item.price || 0);
    return totals;
  }, {});

  return <div className={styles.home}>
    <header className={styles.homeHeader}>
      <div>
        <h1>Home</h1>
      </div>
      <div className={styles.homeActions}>
        <Button onClick={onCart} variant="secondary"><Icon name="bag" size={16} /> Cart{cart.length ? ` (${cart.length})` : ""}</Button>
        <Button onClick={() => onNavigate("Scroll")}><Icon name="scroll" size={16} /> Start scrolling</Button>
      </div>
    </header>
    <div className={styles.grid}>
    <section className={styles.feed}>
      {(cartLoading || cart.length > 0) && <CartPreview cart={cart} loading={cartLoading} onOpen={onCart} onRemove={onRemoveFromCart} />}
      <BudgetPreview categories={categorySpend} plannedSpend={plannedSpend} onOpen={onBudget} />
      <section className={styles.finds}>
      <header className={styles.heading}>
        <div><h1>Today&apos;s finds</h1></div>
        <Button className={styles.tuneButton} onClick={onTune} variant="secondary"><Icon name="sparkles" size={16} /> Tune my feed</Button>
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
              <div className={styles.brandRow}><span>{product.brand}</span><button type="button" disabled={Boolean(motion)} aria-label={isSaved ? `Edit ${product.name} collections` : `Save ${product.name} to a collection`} aria-pressed={isSaved} className={isSaved ? styles.saved : ""} onClick={() => onSave(product)}><Icon filled={isSaved} name="bookmark" size={19} /></button></div>
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
          <Button aria-label={isSaved ? `Edit ${product.name} collections` : `Save ${product.name} to a collection`} aria-pressed={isSaved} disabled={Boolean(motion)} onClick={() => onSave(product)} variant="icon"><Icon filled={isSaved} name="bookmark" size={18} /></Button>
          <Button aria-label="Share product" disabled={Boolean(motion)} onClick={() => onShare(product)} variant="icon"><Icon name="share" size={18} /></Button>
        </div>
        <p className={styles.hint}><span>↑</span> Skip <span>↓</span> Back · Heart to like</p>
      </>}
      </section>
    </section>
    <DiscoverInsights compact products={products} profile={profile} onTune={onTune} showBudget={false} />
  </div>
  </div>;
}

function CartPreview({ cart, loading, onOpen, onRemove }) {
  const total = cart.reduce((sum, item) => sum + Number(item.price || 0), 0);
  return <section className={styles.dashboardSection}>
    <header className={styles.sectionHeader}>
      <div><p className="shop-kicker">Ready when you are</p><h2>Cart</h2></div>
      <Button className={styles.sectionAction} onClick={onOpen} variant="ghost">View cart <Icon name="arrowRight" size={15} /></Button>
    </header>
    <div className={styles.cartCard}>
      {loading ? <p className={styles.loading}>Restoring your cart…</p> : cart.map(item => <div className={styles.cartRow} key={item.id}>
        <ProductImage alt="" src={item.image} />
        <div><strong>{item.name}</strong><span>{item.brand}</span></div>
        <b>${Number(item.price).toFixed(2)}</b>
        <button aria-label={`Remove ${item.name} from cart`} onClick={() => onRemove(item.id)} type="button"><Icon name="x" size={15} /></button>
      </div>)}
      {!loading && <footer className={styles.cartFooter}>
        <span>Subtotal · {cart.length} item{cart.length === 1 ? "" : "s"}</span>
        <strong>${total.toFixed(2)}</strong>
      </footer>}
    </div>
  </section>;
}

function BudgetPreview({ categories, plannedSpend, onOpen }) {
  const budget = 400;
  const categoryRows = Object.entries(categories).sort(([, a], [, b]) => b - a).slice(0, 3);
  return <section className={styles.dashboardSection}>
    <header className={styles.sectionHeader}>
      <div><h2>Budget &amp; estimated spend</h2></div>
      <Button className={styles.sectionAction} onClick={onOpen} variant="ghost">Budget <Icon name="arrowRight" size={15} /></Button>
    </header>
    <div className={styles.budgetCard}>
      <div className={styles.budgetSummary}>
        <div><span>Planned spend</span><strong>${plannedSpend.toFixed(0)}</strong><small>of ${budget} comfort budget</small></div>
        <span className={styles.budgetRemaining}>${Math.max(budget - plannedSpend, 0).toFixed(0)} left</span>
      </div>
      <div className={styles.budgetTrack}><i style={{ width: `${Math.min((plannedSpend / budget) * 100, 100)}%` }} /></div>
      {categoryRows.length > 0 ? <div className={styles.categoryRows}>{categoryRows.map(([category, amount]) => <div key={category}>
        <span>{category}</span><i><b style={{ width: `${Math.min((amount / budget) * 100, 100)}%` }} /></i><strong>${amount.toFixed(0)}</strong>
      </div>)}</div> : <p className={styles.budgetEmpty}>Save finds or add an item to your cart to see your plan take shape.</p>}
    </div>
  </section>;
}
