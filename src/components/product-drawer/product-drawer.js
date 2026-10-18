"use client";

import { useEffect } from "react";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import { formatProductPrice } from "@/utils/catalogProduct.mjs";
import styles from "./product-drawer.module.css";

export default function ProductDrawer({ product, type, onClose, onSave, onDislike, onTooExpensive, onAddToCart, inCart, canAddToCart, showCartActions, showPriceFeedback }) {
  const reviewCount = Number.isInteger(product.reviews) && product.reviews > 0 ? product.reviews : 0;
  const rating = Number.isFinite(product.rating) ? product.rating.toFixed(1) : null;
  const hashtags = [...new Set(product.hashtags || product.tags || [])];
  const mainCategory = product.mainCategory;
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
          <p className="shop-kicker">{product.brand}</p>
          <h2>{product.name}</h2>
          <div className={styles.rating}>
            <strong>{formatProductPrice(product.price)}</strong>
            <span>
              {rating && <Icon filled name="star" size={14} />} {rating || "Not rated"} · {reviewCount.toLocaleString()} ratings
            </span>
          </div>
          {type === "details" ? (
            <>
              <p>{product.description}</p>
              <h3>Category &amp; tags</h3>
              <dl className={styles.productMetadata}>
                <div>
                  <dt>Category</dt>
                  <dd>{mainCategory || "Not listed for this item"}</dd>
                </div>
                <div>
                  <dt>Subcategory</dt>
                  <dd>{product.subcategory || "Not listed for this item"}</dd>
                </div>
                {hashtags.length > 0 && (
                  <div>
                    <dt>Tags</dt>
                    <dd className={styles.hashtags}>
                      {hashtags.map((tag) => (
                        <span key={tag}>#{tag.replace(/^#/, "")}</span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
              <h3>About this find</h3>
              <div className={styles.note}>
                <Icon name="sparkles" size={18} />
                <p>
                  A product from the ShopScroll catalog. Heart or save it to keep track of what catches your eye.
                </p>
              </div>
              <h3>Good to know</h3>
              <ul>
                <li>Visit the retailer listing for current availability, shipping, and return details.</li>
                <li>Price and product details may change at the retailer.</li>
              </ul>
            </>
          ) : (
            <>
              <div className={styles.note}>
                <Icon name="sparkles" size={18} />
                <p>
                  {reviewCount ? `${reviewCount.toLocaleString()} customer ratings are listed in the catalog.` : "Customer ratings are not available in the catalog yet."}
                  <small>Individual review text is not included here.</small>
                </p>
              </div>
            </>
          )}
          <div className={styles.actions}>
            <Button onClick={() => onSave(product)}>
              <Icon name="bookmark" size={17} /> Save to collection
            </Button>
            {type === "details" && showCartActions && (
              <Button
                disabled={!canAddToCart || inCart}
                onClick={() => onAddToCart(product)}
                title={!canAddToCart ? "A listed price and Amazon listing are required" : undefined}
                variant="secondary"
              >
                <Icon name="cart" size={17} /> {inCart ? "In cart" : canAddToCart ? "Add to cart" : "Unavailable"}
              </Button>
            )}
            {product.productUrl ? <a
              className={styles.retailerLink}
              href={product.productUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Visit retailer <Icon name="arrowRight" size={17} />
            </a> : <Button disabled title="Retailer link unavailable" variant="secondary">
              Visit retailer <Icon name="arrowRight" size={17} />
            </Button>}
          </div>
          {type === "details" && (
            <>
              {showPriceFeedback && (
                <div className={styles.feedbackAction}>
                  <Button onClick={() => onTooExpensive(product)} variant="secondary">
                    <Icon name="x" size={16} /> Too expensive
                  </Button>
                  <p>We&apos;ll prioritize lower-priced finds.</p>
                </div>
              )}
              {(product.mainCategory || product.category) && (
                <div className={styles.feedbackAction}>
                  <Button onClick={() => onDislike(product)} variant="secondary">
                    <Icon name="x" size={16} /> I don&apos;t like this
                  </Button>
                  <p>We&apos;ll show you fewer {product.mainCategory || product.category} finds.</p>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
