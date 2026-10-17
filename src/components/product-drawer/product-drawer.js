"use client";

import { useEffect } from "react";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import styles from "./product-drawer.module.css";

const reviewBars = [
  [5, 78],
  [4, 14],
  [3, 6],
  [2, 2],
];

export default function ProductDrawer({ product, type, onClose, onSave }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <aside
        aria-label={`${product.name} ${type === "details" ? "details" : "reviews"}`}
        aria-modal="true"
        className={styles.drawer}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className={styles.top}>
          <span>
            {type === "details" ? "Product details" : "Review snapshot"}
          </span>
          <Button
            aria-label="Close product details"
            onClick={onClose}
            variant="icon"
          >
            <Icon name="x" size={19} />
          </Button>
        </header>
        <ProductImage
          alt={product.name}
          className={styles.image}
          src={product.image}
        />
        <div className={styles.body}>
          <p className="shop-kicker">
            {product.brand} · {product.category}
          </p>
          <h2>{product.name}</h2>
          <div className={styles.rating}>
            <strong>${product.price}</strong>
            <span>
              <Icon filled name="star" size={14} /> {product.rating} (
              {product.reviews.toLocaleString()})
            </span>
          </div>
          {type === "details" ? (
            <>
              <p>{product.description}</p>
              <h3>Why it&apos;s in your feed</h3>
              <div className={styles.note}>
                <Icon name="sparkles" size={18} />
                <p>
                  Recommended because you like minimalist design and usually
                  save products under $100.
                  <small>AI-generated demo explanation</small>
                </p>
              </div>
              <h3>Good to know</h3>
              <ul>
                <li>Free 30-day returns</li>
                <li>Ships in 2–4 business days</li>
                <li>Materials and care details available at retailer</li>
              </ul>
            </>
          ) : (
            <>
              <div className={styles.note}>
                <Icon name="sparkles" size={18} />
                <p>
                  Buyers often praise the thoughtful design and everyday
                  comfort. A few mention the finish can show wear over time.
                  <small>AI-generated demo summary, not verified reviews</small>
                </p>
              </div>
              <div className={styles.reviewBars}>
                {reviewBars.map(([stars, share]) => (
                  <div key={stars}>
                    <span>
                      {stars} <Icon filled name="star" size={11} />
                    </span>
                    <i>
                      <b style={{ width: `${share}%` }} />
                    </i>
                    <small>{share}%</small>
                  </div>
                ))}
              </div>
              <h3>What people mention</h3>
              <div className={styles.sentiments}>
                <span>
                  <Icon name="check" /> Beautiful finish
                </span>
                <span>
                  <Icon name="check" /> Easy to use
                </span>
                <span>
                  <Icon name="x" /> Packaging
                </span>
              </div>
            </>
          )}
          <div className={styles.actions}>
            <Button onClick={() => onSave(product)}>
              <Icon name="bookmark" size={17} /> Save to collection
            </Button>
            <Button
              disabled
              title="Retailer links are not available in this demo"
              variant="secondary"
            >
              Visit retailer <Icon name="arrowRight" size={17} />
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
