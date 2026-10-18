"use client";

import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import PageHeader from "@/components/page-header/page-header";
import { formatProductPrice } from "@/utils/catalogProduct.mjs";
import { cartTotal } from "@/utils/cart.mjs";
import styles from "./cart.module.css";

export default function Cart({ items = [], loading = false, onRemove, onShop }) {
  const total = cartTotal(items);
  return (
    <section className="shop-page">
      <PageHeader
        description="Review your picks, see the listed-price total, and continue to Amazon for each item."
        eyebrow="Your cart"
        title="Cart"
      />
      {loading ? (
        <p className="shop-panel" role="status">Loading your cart…</p>
      ) : !items.length ? (
        <div className={`shop-empty shop-panel ${styles.empty}`}>
          <Icon name="bag" size={30} />
          <h2>Your cart is waiting for a find.</h2>
          <p>Add products from Scroll details or your saved collections.</p>
          <Button onClick={onShop}>Explore Scroll</Button>
        </div>
      ) : (
        <>
          <div className={styles.items}>
            {items.map(item => (
              <article className={styles.item} key={item.id}>
                <ProductImage alt="" src={item.image} />
                <div className={styles.details}>
                  {item.brand && <span>{item.brand}</span>}
                  <h2>{item.name}</h2>
                  <strong>{formatProductPrice(item.price)}</strong>
                  <div className={styles.actions}>
                    <a href={item.amazonUrl} rel="noopener noreferrer" target="_blank">
                      Buy on Amazon <Icon name="arrowRight" size={15} />
                    </a>
                    <Button onClick={() => onRemove(item.id)} variant="ghost">
                      Remove
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <aside className={styles.summary}>
            <span>Listed-price total</span>
            <strong>{formatProductPrice(total)}</strong>
            <p>Tax, shipping, availability, and checkout are determined by Amazon.</p>
          </aside>
        </>
      )}
    </section>
  );
}
