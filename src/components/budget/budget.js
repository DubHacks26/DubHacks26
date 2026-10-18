"use client";

import { useState } from "react";
import { formatProductPrice } from "@/utils/catalogProduct.mjs";
import { cartTotal } from "@/utils/cart.mjs";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import PageHeader from "@/components/page-header/page-header";
import styles from "./budget.module.css";

export default function Budget({
  items = [],
  loading = false,
  onRemove,
  catalogProducts = [],
  limit = 400,
  onLimitChange,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(limit));
  const total = cartTotal(items);
  const categoryById = new Map(catalogProducts.map(product => [String(product.asin || product.id), product.category || "Other"]));
  const categoryBreakdown = [...new Set(items.map(item => categoryById.get(item.id) || "Other"))]
    .map(category => [
      category,
      total
        ? Math.round(items
          .filter(item => (categoryById.get(item.id) || "Other") === category)
          .reduce((sum, item) => sum + item.price, 0) / total * 100)
        : 0,
    ]);
  const percentage = Math.round((total / limit) * 100);

  const updateLimit = (event) => {
    event.preventDefault();
    const amount = Number(draft);
    if (amount > 0) {
      onLimitChange(amount);
      setEditing(false);
    }
  };

  return (
    <section className="shop-page">
      <PageHeader
        description="Track the listed-price total of products you have added to your cart."
        eyebrow="Spend with intention"
        title="Your cart, your budget."
      />
      <div className={styles.hero}>
        <div>
          <p>Cart value</p>
          <strong>{formatProductPrice(total)}</strong>
          <span>of {formatProductPrice(limit)} comfort budget</span>
        </div>
        <div
          className={styles.ring}
          style={{ "--progress": `${Math.min(percentage, 100)}%` }}
        >
          <span>
            <strong>{percentage}%</strong>used
          </span>
        </div>
        <div className={styles.remaining}>
          <p>Remaining</p>
            <strong>{formatProductPrice(Math.max(limit - total, 0))}</strong>
          <Button onClick={() => {
            setDraft(String(limit));
            setEditing(true);
          }} variant="secondary">
            Adjust budget
          </Button>
        </div>
      </div>
      {editing && (
        <form className={styles.edit} onSubmit={updateLimit}>
          <label htmlFor="budget-limit">Comfort budget</label>
          <span>$</span>
          <input
            autoFocus
            id="budget-limit"
            min="1"
            onChange={(event) => setDraft(event.target.value)}
            type="number"
            value={draft}
          />
          <Button type="submit">Save</Button>
          <Button onClick={() => setEditing(false)} variant="ghost">
            Cancel
          </Button>
        </form>
      )}
      {total > limit && (
        <div className={styles.warning}>
          <Icon name="wallet" />
          <p>
            <strong>Your cart is {formatProductPrice(total - limit)} over budget.</strong>
            <span>Try removing an item from your cart or adjusting your comfort budget.</span>
          </p>
        </div>
      )}
      <div className={styles.columns}>
        <div className="shop-panel">
          <h2>By category</h2>
          {loading ? <p role="status">Loading your cart…</p> : categoryBreakdown.length ? (
            categoryBreakdown.map(([category, share]) => (
              <div className={styles.breakdown} key={category}>
                <span>{category}</span>
                <i>
                  <b style={{ width: `${share}%` }} />
                </i>
                <strong>{share}%</strong>
              </div>
            ))
          ) : <p>No cart items to break down yet.</p>}
        </div>
        <div className="shop-panel">
          <h2>Items in your cart</h2>
          {loading ? (
            <p role="status">Loading your cart…</p>
          ) : items.length ? (
            items.map((item) => (
              <div className={styles.product} key={item.id}>
                <ProductImage alt="" src={item.image} />
                <p>
                  <strong>{item.name}</strong>
                  <span>{item.brand}</span>
                </p>
                <b>{formatProductPrice(item.price)}</b>
                <Button
                  aria-label={`Remove ${item.name}`}
                  onClick={() => onRemove(item.id)}
                  variant="icon"
                >
                  <Icon name="x" size={15} />
                </Button>
              </div>
            ))
          ) : (
            <div className="shop-empty">
              <Icon name="bag" />
              <p>Add products to your cart to see them here.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
