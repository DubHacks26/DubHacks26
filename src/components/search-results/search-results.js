"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { searchCatalogProducts } from "@/api/UserAPI";
import { normalizeCatalogProduct } from "@/utils/catalogProduct.mjs";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import styles from "./search-results.module.css";

function SearchResultsContent({ submittedQuery, onSelect, onLearned }) {
  const router = useRouter();
  const [query, setQuery] = useState(submittedQuery);
  const [result, setResult] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!submittedQuery.trim()) return undefined;

    let active = true;
    const currentRequest = ++requestId.current;
    searchCatalogProducts(submittedQuery, { learn: true })
      .then((response) => {
        if (!active || currentRequest !== requestId.current) return;
        const results = (response.products || []).map(normalizeCatalogProduct);
        if (response.learned) onLearned?.();
        const message = results.length
          ? response.learned
            ? "This search will gently guide your recommendations."
            : "Matches based on meaning, not just exact words."
          : "No close matches yet. Try a different search.";
        setResult({ query: submittedQuery, products: results, message });
      })
      .catch((error) => {
        if (!active || currentRequest !== requestId.current) return;
        setResult({
          query: submittedQuery,
          products: [],
          message: error?.response?.data?.error || "Search is temporarily unavailable.",
        });
      });

    return () => {
      active = false;
    };
  }, [submittedQuery, onLearned]);

  const submitSearch = (event) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    router.push(`/search?query=${encodeURIComponent(trimmedQuery)}`);
  };

  const currentResult = result?.query === submittedQuery ? result : null;
  const loading = Boolean(submittedQuery.trim()) && !currentResult;
  const products = currentResult?.products || [];
  const message = currentResult?.message || "";

  return (
    <section className={styles.page}>
      <div className={styles.heading}>
        <p className="shop-kicker">Discover</p>
        <h1>Search products</h1>
        <p>Find products by what you mean, not just the exact words.</p>
      </div>
      <form className={styles.form} onSubmit={submitSearch}>
        <Icon name="search" size={19} />
        <input
          aria-label="Search products"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Describe what you’re looking for"
          value={query}
        />
        <Button disabled={!query.trim()} type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {submittedQuery && (
        <div className={styles.results}>
          <div className={styles.resultHeading}>
            <h2>Results for “{submittedQuery}”</h2>
            {products.length > 0 && <span>{products.length} finds</span>}
          </div>
          {loading && <p className={styles.status} role="status">Finding similar products…</p>}
          {!loading && message && <p className={styles.status} role="status">{message}</p>}
          <div className={styles.grid}>
            {products.map((product) => (
              <button
                className={styles.product}
                key={product.id}
                onClick={() => onSelect(product)}
                type="button"
              >
                <ProductImage alt="" src={product.image} />
                <span className={styles.productInfo}>
                  <strong>{product.name}</strong>
                  <small>{product.brand} · {product.category || "Product"}</small>
                  <b>{Number.isFinite(product.price) ? `$${product.price}` : "Price unavailable"}</b>
                </span>
                <Icon name="chevronRight" size={18} />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function SearchResults({ onSelect, onLearned }) {
  const searchParams = useSearchParams();
  const submittedQuery = searchParams.get("query") || "";
  return (
    <SearchResultsContent
      key={submittedQuery}
      onLearned={onLearned}
      onSelect={onSelect}
      submittedQuery={submittedQuery}
    />
  );
}
