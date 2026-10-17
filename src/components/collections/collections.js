"use client";

import { useState } from "react";
import { products } from "@/utils/shopScrollerData";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import PageHeader from "@/components/page-header/page-header";
import styles from "./collections.module.css";

const starterCollections = [
  {
    name: "Dream Space",
    count: 8,
    estimate: 482,
    images: [products[1], products[3], products[0]],
  },
  {
    name: "Everyday Upgrades",
    count: 12,
    estimate: 706,
    images: [products[2], products[0], products[3]],
  },
  {
    name: "Gifts for Friends",
    count: 5,
    estimate: 224,
    images: [products[3], products[1], products[2]],
  },
];

export default function Collections({ saved, onSave }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [custom, setCustom] = useState([]);
  const savedProducts = products.filter((product) =>
    saved.includes(product.id),
  );
  const collections = [...starterCollections, ...custom];

  const createCollection = (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCustom((current) => [
      ...current,
      { name: trimmed, count: 0, estimate: 0, images: products.slice(0, 3) },
    ]);
    setName("");
    setShowForm(false);
  };

  return (
    <section className="shop-page">
      <PageHeader
        action={
          <Button onClick={() => setShowForm(true)}>
            <Icon name="plus" size={17} /> New collection
          </Button>
        }
        description="Everything you love, beautifully organized."
        eyebrow="Your saved finds"
        title="Collections"
      />
      {showForm && (
        <form className={styles.form} onSubmit={createCollection}>
          <input
            aria-label="Collection name"
            autoFocus
            onChange={(event) => setName(event.target.value)}
            placeholder="Collection name"
            value={name}
          />
          <Button disabled={!name.trim()} type="submit">
            Create
          </Button>
          <Button onClick={() => setShowForm(false)} variant="ghost">
            Cancel
          </Button>
        </form>
      )}
      <div className={styles.grid}>
        {collections.map((collection, index) => (
          <article className={styles.card} key={`${collection.name}-${index}`}>
            <div className={styles.collage}>
              {collection.images.map((product) => (
                <ProductImage alt="" key={product.id} src={product.image} />
              ))}
            </div>
            <div className={styles.cardFooter}>
              <span>
                <strong>{collection.name}</strong>
                <small>
                  {collection.count + (index === 0 ? saved.length : 0)} items ·
                  ${collection.estimate} est.
                </small>
              </span>
              <Icon name="more" />
            </div>
          </article>
        ))}
        <button
          className={styles.add}
          onClick={() => setShowForm(true)}
          type="button"
        >
          <Icon name="plus" size={24} />
          <strong>Create a collection</strong>
          <span>Group your favorite finds</span>
        </button>
      </div>
      {savedProducts.length > 0 && (
        <>
          <p className="shop-kicker">Recently saved</p>
          <div className={styles.saved}>
            {savedProducts.map((product) => (
              <article key={product.id}>
                <ProductImage alt="" src={product.image} />
                <strong>{product.name}</strong>
                <span>${product.price}</span>
                <Button onClick={() => onSave(product)} variant="ghost">
                  Remove
                </Button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
