"use client";

import { useState } from "react";
import Link from "next/link";
import { products as demoProducts } from "@/utils/shopScrollerData";
import { likedCollectionId } from "@/utils/feed.mjs";
import { formatProductPrice } from "@/utils/catalogProduct.mjs";
import { toCartItem } from "@/utils/cart.mjs";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import PageHeader from "@/components/page-header/page-header";
import styles from "./collections.module.css";

export default function Collections({
  collections = [],
  catalogProducts = [],
  onCreateCollection,
  onDeleteCollection,
  onRemoveFromCollection,
  onAddToCart,
  cartIds = [],
  cartReady = true,
  onDiscover,
  collectionId = null,
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const catalog = [...demoProducts, ...catalogProducts];
  const productById = new Map(catalog.map(product => [product.id, product]));
  const selectedCollection = collectionId
    ? collections.find(collection => collection.id === collectionId)
    : null;
  const selectedProducts = (selectedCollection?.productIds || [])
    .map(id => productById.get(id))
    .filter(Boolean);

  const createCollection = (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreateCollection(trimmed);
    setName("");
    setShowForm(false);
  };

  return (
    <section className="shop-page">
      {selectedCollection ? (
        <header className={styles.detailHeader}>
          <Link className={styles.backLink} href="/collections">
            <Icon name="arrowLeft" size={17} /> All collections
          </Link>
          <p className="shop-kicker">{selectedCollection.id === likedCollectionId ? "Automatically collected" : "Your collection"}</p>
          <h1>{selectedCollection.name}</h1>
          <p>{selectedCollection.productIds.length} {selectedCollection.productIds.length === 1 ? "item" : "items"} saved here.</p>
        </header>
      ) : (
        <PageHeader
          action={
            <Button onClick={() => setShowForm(true)}>
              <Icon name="plus" size={17} /> New collection
            </Button>
          }
          description="Keep the products you love organized in one place."
          eyebrow="Your saved finds"
          title="Collections"
        />
      )}
      {showForm && (
        <form className={styles.form} onSubmit={createCollection}>
          <input
            aria-label="Collection name"
            autoFocus
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            placeholder="Collection name"
            value={name}
          />
          <Button disabled={!name.trim()} type="submit">Create</Button>
          <Button onClick={() => { setShowForm(false); setName(""); }} variant="ghost">Cancel</Button>
        </form>
      )}

      {!collectionId && (
        <div className={styles.grid}>
          {collections.map(collection => {
            const items = (collection.productIds || []).map(id => productById.get(id)).filter(Boolean);
            const isLiked = collection.id === likedCollectionId;
            const estimate = items.reduce((total, item) => total + (Number(item.price) || 0), 0);
            return (
              <article className={styles.card} key={collection.id}>
                <Link className={styles.cardSelect} href={`/collections/${encodeURIComponent(collection.id)}`}>
                  <span className={styles.collage}>
                    {items.slice(0, 4).map(item => <ProductImage alt="" key={item.id} src={item.image} />)}
                    {!items.length && <span className={styles.placeholder}><Icon filled={isLiked} name={isLiked ? "heart" : "layers"} size={27} /></span>}
                  </span>
                  <span className={styles.cardFooter}>
                    <span>
                      <strong>{collection.name}</strong>
                      <small>{collection.productIds.length} {collection.productIds.length === 1 ? "item" : "items"} · ${estimate.toFixed(2)} est.</small>
                    </span>
                    {isLiked && <span className={styles.defaultBadge}>Default</span>}
                  </span>
                </Link>
                {!isLiked && <button className={styles.delete} onClick={() => onDeleteCollection(collection.id)} type="button" aria-label={`Delete ${collection.name}`} title={`Delete ${collection.name}`}><Icon name="x" size={16} /></button>}
              </article>
            );
          })}
          <button className={styles.add} onClick={() => setShowForm(true)} type="button">
            <Icon name="plus" size={24} />
            <strong>Create a collection</strong>
            <span>Group your favorite finds</span>
          </button>
        </div>
      )}

      {selectedCollection && (
        <section className={styles.collectionItems} aria-labelledby="collection-items-title">
          {!selectedProducts.length ? (
            <div className="shop-empty shop-panel">
              <Icon name={selectedCollection.id === likedCollectionId ? "heart" : "bookmark"} size={30} />
              <h3>{selectedCollection.id === likedCollectionId ? "Heart a product to add it here." : "This collection is ready for finds."}</h3>
              <p>{selectedCollection.id === likedCollectionId ? "Products you like will appear in this collection." : "Use Save on a product and choose this collection."}</p>
              <Button onClick={onDiscover}>Explore Discover</Button>
            </div>
          ) : (
            <div className={styles.productGrid}>
              {selectedProducts.map(product => {
                const cartItem = toCartItem(product);
                const inCart = cartItem && cartIds.includes(cartItem.id);
                return (
                  <article key={product.id}>
                    <ProductImage alt="" src={product.image} />
                    <strong>{product.name}</strong>
                    <span>{formatProductPrice(product.price)}</span>
                    <Button
                      disabled={!cartReady || !cartItem || inCart}
                      onClick={() => onAddToCart(product)}
                      title={!cartReady ? "Cart is loading" : !cartItem ? "A listed price and Amazon listing are required" : undefined}
                      variant="secondary"
                    >
                      {!cartReady ? "Loading cart" : inCart ? "In cart" : cartItem ? "Add to cart" : "Unavailable"}
                    </Button>
                    <Button onClick={() => onRemoveFromCollection(selectedCollection.id, product)} variant="ghost">
                      {selectedCollection.id === likedCollectionId ? "Unlike" : "Remove"}
                    </Button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
      {collectionId && !selectedCollection && (
        <div className="shop-empty shop-panel">
          <Icon name="layers" size={30} />
          <h2>That collection isn&apos;t available.</h2>
          <Link className={styles.backLink} href="/collections"><Icon name="arrowLeft" size={17} /> All collections</Link>
        </div>
      )}
    </section>
  );
}
