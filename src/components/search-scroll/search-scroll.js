"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getProductsByAsins, searchCatalogProducts } from "@/api/UserAPI";
import { normalizeCatalogProduct } from "@/utils/catalogProduct.mjs";
import { loadSearchScrollProducts } from "@/utils/search-scroll-loading.mjs";
import { getFeed } from "@/utils/feed.mjs";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductScroll from "@/components/product-scroll/product-scroll";
import styles from "./search-scroll.module.css";

function SearchScrollContent({
  query,
  historyProducts,
  onDetails,
  onHeart,
  onSkip,
  onSave,
  onShare,
  profile,
  saved,
  cartTotal,
  budgetLimit,
}) {
  const router = useRouter();
  const [result, setResult] = useState(null);
  const [rankingTimestamp] = useState(() => Date.now());
  const requestId = useRef(0);
  const normalizedHistory = useMemo(
    () => historyProducts.map(normalizeCatalogProduct),
    [historyProducts],
  );
  const searchProducts = useMemo(() => {
    if (!result || result.query !== query) return [];
    const hasFeedback = profile.events.length > 0;
    if (!hasFeedback) return result.products;
    return getFeed(
      result.products,
      profile,
      rankingTimestamp,
      [...result.products, ...normalizedHistory],
    );
  }, [normalizedHistory, profile, query, rankingTimestamp, result]);

  useEffect(() => {
    if (!query.trim()) return undefined;

    let active = true;
    const currentRequest = ++requestId.current;
    const controller = new AbortController();
    const isActive = () => active && currentRequest === requestId.current;
    searchCatalogProducts(query, { signal: controller.signal })
      .then(async (response) => {
        if (!isActive()) return;
        await loadSearchScrollProducts(response.products, {
          isActive,
          loadDetails: asins => getProductsByAsins(asins, { signal: controller.signal }),
          onProducts: products => setResult({
            query,
            products,
            error: "",
            message: response.valid === false
              ? "Try a more specific product search."
              : "",
          }),
        });
      })
      .catch((error) => {
        if (!isActive()) return;
        setResult({
          query,
          products: [],
          error: error?.response?.data?.error || error?.message || "Search is temporarily unavailable.",
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [query]);

  const goToRegularScroll = () => router.push("/scroll");
  const currentResult = result?.query === query ? result : null;

  if (!query.trim()) {
    return (
      <section className={styles.message} aria-labelledby="search-scroll-empty-title">
        <Icon name="search" size={30} />
        <p className="shop-kicker">Search scroll</p>
        <h1 id="search-scroll-empty-title">Start with a search first.</h1>
        <p>Choose a search from the results page to scroll through related finds.</p>
        <Button onClick={() => router.push("/search")} variant="secondary">Go to search</Button>
      </section>
    );
  }

  if (!currentResult) {
    return (
      <section className={styles.message} role="status" aria-live="polite">
        <span className={styles.spinner} aria-hidden="true" />
        <p className="shop-kicker">Search scroll</p>
        <h1>Finding your search matches…</h1>
        <p>Only products related to “{query}” will appear here.</p>
        <Button onClick={goToRegularScroll} variant="secondary">Back to your feed</Button>
      </section>
    );
  }

  if (currentResult.error || !currentResult.products.length) {
    return (
      <section className={styles.message} aria-labelledby="search-scroll-empty-title">
        <Icon name="search" size={30} />
        <p className="shop-kicker">Search scroll</p>
        <h1 id="search-scroll-empty-title">
          {currentResult.error ? "Couldn’t load these finds." : "No close matches found."}
        </h1>
        <p>{currentResult.error || currentResult.message || `Try another search for “${query}”.`}</p>
        <Button onClick={goToRegularScroll} variant="secondary">Back to your feed</Button>
      </section>
    );
  }

  return (
    <ProductScroll
      key={query}
      error=""
      budgetLimit={budgetLimit}
      cartTotal={cartTotal}
      liked={profile.likes}
      onDetails={onDetails}
      onExitSearch={goToRegularScroll}
      onHeart={onHeart}
      onSave={onSave}
      onShare={onShare}
      onSkip={onSkip}
      products={searchProducts}
      reorderUnseen
      saved={saved}
      searchQuery={query}
    />
  );
}

export default function SearchScroll(props) {
  const searchParams = useSearchParams();
  const query = searchParams.get("query") || "";
  return <SearchScrollContent key={query} {...props} query={query} />;
}
