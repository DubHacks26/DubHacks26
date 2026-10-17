"use client";

import { useEffect, useState } from "react";
import { products } from "@/utils/shopScrollerData";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import styles from "./search-overlay.module.css";

const suggestions = [
  "Headphones under $100",
  "Minimal desk lamps",
  "Cute dorm decorations",
  "Sustainable sneakers",
];

export default function SearchOverlay({ onClose, onSelect }) {
  const [query, setQuery] = useState("");
  const results = products.filter((product) =>
    `${product.name} ${product.brand} ${product.category} ${product.tags.join(" ")} ${product.styles.join(" ")} ${product.colors.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        aria-label="Search products"
        aria-modal="true"
        className={styles.modal}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className={styles.input}>
          <Icon name="search" />
          <input
            aria-label="Search products"
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="What are you looking for?"
            value={query}
          />
          <Button onClick={onClose} variant="ghost">
            ESC
          </Button>
        </div>
        {!query && (
          <div className={styles.suggestions}>
            <p className="shop-kicker">Popular searches</p>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setQuery(suggestion.split(" ")[0])}
                type="button"
              >
                <Icon name="search" size={15} />
                {suggestion}
                <Icon name="arrowRight" size={14} />
              </button>
            ))}
          </div>
        )}
        {query && (
          <div className={styles.results}>
            {results.length ? (
              results.map((product) => (
                <button
                  key={product.id}
                  onClick={() => onSelect(product)}
                  type="button"
                >
                  <ProductImage alt="" src={product.image} />
                  <span>
                    <strong>{product.name}</strong>
                    <small>
                      {product.brand} · {product.category}
                    </small>
                  </span>
                  <b>${product.price}</b>
                  <Icon name="chevronRight" />
                </button>
              ))
            ) : (
              <div className="shop-empty">
                <Icon name="search" />
                <p>No exact matches yet. Try a broader search.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
