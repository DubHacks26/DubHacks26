"use client";

import { useEffect, useRef, useState } from "react";
import { likedCollectionId } from "@/utils/feed.mjs";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import styles from "./collection-picker.module.css";

export default function CollectionPicker({ product, collections, onApply, onClose, onCreateCollection }) {
  const dialog = useRef(null);
  const [newName, setNewName] = useState("");
  const [initialSelection] = useState(() => collections
    .filter(collection => collection.id !== likedCollectionId
      && collection.productIds.some(id => String(id) === String(product.id)))
    .map(collection => collection.id));
  const [selected, setSelected] = useState(initialSelection);

  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);

  const toggle = (id) => {
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  };
  const selectionChanged = selected.length !== initialSelection.length
    || selected.some(id => !initialSelection.includes(id));

  const createCollection = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const id = onCreateCollection(trimmed);
    if (id) setSelected(current => current.includes(id) ? current : [...current, id]);
    setNewName("");
  };

  return (
    <dialog
      aria-labelledby="collection-picker-title"
      className={styles.dialog}
      onCancel={onClose}
      onClick={(event) => { if (event.target === dialog.current) onClose(); }}
      ref={dialog}
    >
      <form onSubmit={(event) => { event.preventDefault(); onApply(selected); }}>
        <header className={styles.header}>
          <div>
            <p className="shop-kicker">Save a favorite</p>
            <h2 id="collection-picker-title">Choose collections</h2>
          </div>
          <Button aria-label="Close collection picker" onClick={onClose} variant="ghost">
            <Icon name="x" size={19} />
          </Button>
        </header>
        <div className={styles.product}>
          <ProductImage alt="" src={product.image} />
          <span><strong>{product.name}</strong><small>{product.brand}</small></span>
        </div>
        <fieldset className={styles.list}>
          <legend>Your collections</legend>
          {collections.map(collection => {
            const isLiked = collection.id === likedCollectionId;
            const checked = isLiked
              ? collection.productIds.includes(product.id)
              : selected.includes(collection.id);
            return (
              <label className={styles.collection} key={collection.id}>
                <input
                  checked={checked}
                  disabled={isLiked}
                  onChange={() => toggle(collection.id)}
                  type="checkbox"
                />
                <span className={styles.check} aria-hidden="true"><Icon name="check" size={15} /></span>
                <span className={styles.collectionCopy}>
                  <strong>{collection.name}</strong>
                  <small>{isLiked ? "Added automatically when you heart a product" : `${collection.productIds.length} items`}</small>
                </span>
                {isLiked && <Icon className={styles.heart} filled name="heart" size={17} />}
              </label>
            );
          })}
        </fieldset>
        <div className={styles.createRow}>
          <input
            aria-label="New collection name"
            maxLength={40}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); createCollection(); } }}
            placeholder="Create a new collection"
            value={newName}
          />
          <Button disabled={!newName.trim()} onClick={createCollection} variant="secondary">Create</Button>
        </div>
        <footer className={styles.footer}>
          <Button onClick={onClose} variant="ghost">Cancel</Button>
          <Button disabled={!selectionChanged} type="submit">
            {selected.length
              ? `Save to ${selected.length} ${selected.length === 1 ? "collection" : "collections"}`
              : "Remove from collections"}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
