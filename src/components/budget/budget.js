"use client";

import { useState } from "react";
import { products as demoProducts } from "@/utils/shopScrollerData";
import { formatProductPrice } from "@/utils/catalogProduct.mjs";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import PageHeader from "@/components/page-header/page-header";
import styles from "./budget.module.css";

export default function Budget({ saved, onRemove, catalogProducts = [] }) {
  const [limit, setLimit] = useState(400);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("400");
  const selected = [...demoProducts, ...catalogProducts].filter((product) => saved.includes(product.id));
  const total = selected.reduce((sum, product) => sum + (Number.isFinite(product.price) ? product.price : 0), 0);
  const categoryBreakdown = [...new Set(selected.map(p => p.category))].map(category => [category, total ? Math.round(selected.filter(p => p.category === category).reduce((sum, p) => sum + (Number.isFinite(p.price) ? p.price : 0), 0) / total * 100) : 0]);
  const percentage = Math.round((total / limit) * 100);

  const updateLimit = (event) => {
    event.preventDefault();
    const amount = Number(draft);
    if (amount > 0) {
      setLimit(amount);
      setEditing(false);
    }
  };

  return (
    <section className="shop-page">
      <PageHeader
        description="A friendly snapshot of hypothetical spending. No real money involved."
        eyebrow="Spend with intention"
        title="Your wishlist, your budget."
      />
      <div className={styles.hero}>
        <div>
          <p>Wishlist value</p>
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
          <Button onClick={() => setEditing(true)} variant="secondary">
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
            <strong>Your wishlist is {formatProductPrice(total - limit)} over budget.</strong>
            <span>Try removing an item or adjusting your comfort budget.</span>
          </p>
        </div>
      )}
      <div className={styles.columns}>
        <div className="shop-panel">
          <h2>By category</h2>
          {categoryBreakdown.map(([category, share]) => (
            <div className={styles.breakdown} key={category}>
              <span>{category}</span>
              <i>
                <b style={{ width: `${share}%` }} />
              </i>
              <strong>{share}%</strong>
            </div>
          ))}
        </div>
        <div className="shop-panel">
          <h2>Items in your wishlist</h2>
          {selected.length ? (
            selected.map((product) => (
              <div className={styles.product} key={product.id}>
                <ProductImage alt="" src={product.image} />
                <p>
                  <strong>{product.name}</strong>
                  <span>{product.brand}</span>
                </p>
                <b>{formatProductPrice(product.price)}</b>
                <Button
                  aria-label={`Remove ${product.name}`}
                  onClick={() => onRemove(product)}
                  variant="icon"
                >
                  <Icon name="x" size={15} />
                </Button>
              </div>
            ))
          ) : (
            <div className="shop-empty">
              <Icon name="bookmark" />
              <p>Save a few products to see them here.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
