"use client";

import { useEffect, useState } from "react";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import styles from "./search-overlay.module.css";

export default function SearchOverlay({ onClose, onSearch }) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const submitSearch = (event) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    onSearch(trimmedQuery);
  };

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        aria-label="Search products"
        aria-modal="true"
        className={styles.modal}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <form className={styles.input} onSubmit={submitSearch}>
          <Icon name="search" />
          <input
            aria-label="Search products"
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Describe what you’re looking for"
            value={query}
          />
          <Button disabled={!query.trim()} type="submit" variant="secondary">
            Search
          </Button>
          <Button onClick={onClose} type="button" variant="ghost">
            ESC
          </Button>
        </form>
      </div>
    </div>
  );
}
