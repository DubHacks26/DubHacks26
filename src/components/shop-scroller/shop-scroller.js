"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getCatalogProducts, getRecommendations } from "@/api/UserAPI";
import { navItems } from "@/utils/shopScrollerData";
import { getFeed, matches, defaultPreferences, likedCollectionId } from "@/utils/feed.mjs";
import { normalizeCatalogProduct } from "@/utils/catalogProduct.mjs";
import FeedPreferences from "@/components/feed-preferences/feed-preferences";
import Discover from "@/components/discover/discover";
import ProductScroll from "@/components/product-scroll/product-scroll";
import Missions from "@/components/missions/missions";
import Collections from "@/components/collections/collections";
import Budget from "@/components/budget/budget";
import Friends from "@/components/friends/friends";
import Profile from "@/components/profile/profile";
import ProductDrawer from "@/components/product-drawer/product-drawer";
import CollectionPicker from "@/components/collection-picker/collection-picker";
import SearchOverlay from "@/components/search-overlay/search-overlay";
import Brand from "@/components/brand/brand";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import styles from "./shop-scroller.module.css";

function errorMessage(error, fallback) {
  const responseError = error?.response?.data?.error;
  if (typeof responseError === "string") return responseError;
  if (responseError && typeof responseError === "object") {
    if (typeof responseError.reason === "string") return responseError.reason;
    if (typeof responseError.message === "string") return responseError.message;
  }
  return typeof error?.message === "string" ? error.message : fallback;
}

function Sidebar({ page, username, count, catalogSize }) {
  const hasLikes = count > 0;
  return (
    <aside className={styles.sidebar}>
      <Link aria-label="ShopScroll home" className={styles.brandHome} href="/discover">
        <Brand scrollMode={page === "Scroll"} />
      </Link>
      <nav aria-label="ShopScroller">
        {navItems.map((item) => (
          <Link
            className={`${styles.navLink} ${page === item.label ? styles.activeNav : ""}`}
            aria-current={page === item.label ? "page" : undefined}
            href={item.href}
            key={item.label}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
            {page === item.label && <i />}
          </Link>
        ))}
      </nav>
      <div className={styles.tasteCard}>
        <Icon name="sparkles" size={18} />
        <strong>Your taste is taking shape</strong>
        <p>{hasLikes ? `${count} like${count === 1 ? " is" : "s are"} shaping your recommendations.` : "Heart something to start shaping your recommendations."}</p>
        <div>
          <i style={{ width: `${Math.min((count / catalogSize) * 100, 100)}%` }} />
        </div>
      </div>
      <div className={styles.user}>
        <div>{username.slice(0, 2).toUpperCase()}</div>
        <span>
          <strong>{username}</strong>
          <small>Taste explorer</small>
        </span>
        <Icon name="more" size={18} />
      </div>
    </aside>
  );
}

function Topbar({ onSearch, onMessages, scrollMode }) {
  return (
    <header className={`${styles.topbar} ${scrollMode ? styles.scrollTopbar : ""}`}>
      <Button className={styles.search} onClick={onSearch} variant="secondary">
        <Icon name="search" size={18} />
        <span>What are you looking for?</span>
        <kbd>⌘ K</kbd>
      </Button>
      <div className={styles.streak}>
        <Icon filled name="zap" size={16} />
        <strong>7</strong> day streak
      </div>
      <Button
        aria-label="Friends and messages"
        onClick={onMessages}
        title="Friends and messages"
        variant="icon"
      >
        <Icon name="message" size={19} />
      </Button>
    </header>
  );
}

export default function AppShell({
  onPersistAction,
  onUndoAction,
  onUpdatePreferences,
  historyProducts,
  profile,
  setProfile,
  user,
  initialPage = "Discover",
}) {
  const pathname = usePathname();
  const router = useRouter();
  const collectionId = pathname.startsWith("/collections/")
    ? decodeURIComponent(pathname.slice("/collections/".length).split("/")[0])
    : null;
  const page = collectionId ? "Collections" : navItems.find(item => item.href === pathname)?.label || initialPage;
  const [catalogProducts, setCatalogProducts] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [catalogReload, setCatalogReload] = useState(0);
  const [recommendationProducts, setRecommendationProducts] = useState([]);
  const [feedTimestamp] = useState(() => Date.now());
  const saved = profile.saved;
  const productById = new Map((catalogProducts || []).map(product => [product.id, product]));
  for (const recommended of recommendationProducts) {
    const catalogProduct = productById.get(recommended.id);
    productById.set(recommended.id, {
      ...catalogProduct,
      ...recommended,
      similarity: recommended.similarity,
    });
  }
  const products = [...productById.values()];
  const sourceProducts = historyProducts.map(normalizeCatalogProduct);
  const feed = getFeed(products, profile, feedTimestamp, [...products, ...sourceProducts]);
  const searchableProducts = getFeed(
    products,
    { ...profile, seen: [] },
    feedTimestamp,
    [...products, ...sourceProducts],
  );
  const currentProduct = feed[0];
  const matchingCount = products.filter(p => matches(p, profile.preferences)).length;
  // Scroll is an intentional, stable reel. Feedback can improve Discover
  // without reordering or removing cards underneath an in-progress gesture.
  const scrollProducts = products;
  const [tuning, setTuning] = useState(false);

  const [lastSwipe, setLastSwipe] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [collectionPickerProduct, setCollectionPickerProduct] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState("");

  const navigateTo = (label) => {
    const destination = navItems.find(item => item.label === label)?.href;
    if (destination) router.push(destination);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getCatalogProducts(100, { refresh: catalogReload > 0 }),
      getRecommendations(100, profile.seen),
    ])
      .then(([rows, recommendations]) => {
        if (cancelled) return;
        setCatalogProducts(rows.map(normalizeCatalogProduct));
        setRecommendationProducts(recommendations.map(normalizeCatalogProduct));
      })
      .catch(error => {
        if (cancelled) return;
        setCatalogProducts([]);
        setCatalogError(errorMessage(error, "The product catalog could not be loaded."));
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => { cancelled = true; };
  }, [user.id, catalogReload, profile.events.length, profile.seen]);

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const persistAction = (product, action, successMessage, onSaved) => {
    const asin = product.asin || product.id;
    if (!/^[A-Z0-9]{10}$/.test(String(asin))) {
      showToast("This demo product isn’t in the catalog, so its action can’t be saved to your account.");
      return Promise.resolve(null);
    }
    return onPersistAction(asin, action)
      .then(event => {
        if (event.embeddingError || event.embeddingApplied === false) {
          showToast("Action saved. Vector learning is temporarily unavailable; other feedback still guides your feed.");
        } else {
          showToast(successMessage);
        }
        onSaved?.(event);
        return event;
      })
      .catch(error => {
        showToast(`Could not save this action: ${error.message}`);
        return null;
      });
  };

  const customCollections = (profile.collections || [])
    .filter(collection => collection.id !== likedCollectionId);

  const createCollection = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const duplicate = (profile.collections || []).find(collection =>
      collection.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
    );
    if (duplicate) {
      showToast(`“${duplicate.name}” already exists`);
      return duplicate.id === likedCollectionId ? null : duplicate.id;
    }
    const id = `collection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setProfile(current => ({
      ...current,
      collections: [
        { id: likedCollectionId, name: "Liked", productIds: current.likes.map(String) },
        ...(current.collections || []).filter(collection => collection.id !== likedCollectionId),
        { id, name: trimmed, productIds: [] },
      ],
    }));
    showToast(`${trimmed} created`);
    return id;
  };

  const updateCustomCollections = (nextCollections) => {
    const previousSaved = new Set(saved.map(String));
    const nextSaved = new Set(nextCollections.flatMap(collection => collection.productIds.map(String)));
    setProfile(current => ({
      ...current,
      collections: [
        { id: likedCollectionId, name: "Liked", productIds: current.likes.map(String) },
        ...nextCollections,
      ],
      saved: [...nextSaved],
    }));
    for (const productId of new Set([...previousSaved, ...nextSaved])) {
      const wasSaved = previousSaved.has(productId);
      const isSaved = nextSaved.has(productId);
      if (wasSaved === isSaved) continue;
      const product = productById.get(productId) || { id: productId, asin: productId, name: "Product" };
      persistAction(product, isSaved ? "save" : "unsave", isSaved ? `${product.name} saved` : `${product.name} removed`);
    }
  };

  const saveProductToCollections = (product, selectedIds) => {
    const nextCollections = customCollections.map(collection => {
      const productIds = collection.productIds.map(String);
      return {
        ...collection,
        productIds: selectedIds.includes(collection.id)
          ? [...new Set([...productIds, String(product.id)])]
          : productIds.filter(id => id !== String(product.id)),
      };
    });
    updateCustomCollections(nextCollections);
    setCollectionPickerProduct(null);
  };

  const removeFromCollection = (collectionIdToUpdate, product) => {
    if (collectionIdToUpdate === likedCollectionId) {
      persistAction(product, "unlike", `${product.name} removed from your hearts`);
      return;
    }
    updateCustomCollections(customCollections.map(collection => ({
      ...collection,
      productIds: collection.id === collectionIdToUpdate
        ? collection.productIds.filter(id => String(id) !== String(product.id))
        : collection.productIds,
    })));
  };

  const deleteCollection = (collectionIdToDelete) => {
    updateCustomCollections(customCollections.filter(collection => collection.id !== collectionIdToDelete));
  };

  const removeFromAllCollections = (product) => {
    updateCustomCollections(customCollections.map(collection => ({
      ...collection,
      productIds: collection.productIds.filter(id => String(id) !== String(product.id)),
    })));
  };

  const openCollectionPicker = (product) => setCollectionPickerProduct(product);

  const swipe = (action) => {
    if (!currentProduct) return;
    persistAction(
      currentProduct,
      action,
      action === "like"
        ? "Liked. Your feed will learn from this."
        : "Skipped. Your feed will learn from this.",
      event => setLastSwipe(event),
    );
  };
  // Discover now passes "like" or "skip" directly (swipe up = skip, heart = like).

  const heartFromScroll = (product) => {
    const wasLiked = profile.likes.includes(product.id);
    persistAction(
      product,
      wasLiked ? "unlike" : "like",
      wasLiked ? `${product.name} removed from your hearts` : `${product.name} hearted`,
    );
  };

  const dislikeProductCategory = (product) => {
    const category = product.mainCategory || product.category;
    persistAction(product, "less_category", `Got it. We’ll show you fewer ${category} finds.`);
    setDrawer(null);
  };

  const markTooExpensive = (product) => {
    persistAction(product, "too_expensive", "Got it. We’ll prioritize lower-priced finds.");
    setDrawer(null);
  };

  const resetPreferences = () => {
    onUpdatePreferences({ ...defaultPreferences, categories: [] })
      .then(() => {
        setProfile(current => ({ ...current, seen: [] }));
        setLastSwipe(null);
        setCatalogReload(current => current + 1);
        showToast("Feed preferences reset");
      })
      .catch(error => showToast(`Could not reset preferences: ${error.message}`));
  };

  useEffect(() => {
    const openSearch = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);

  const undoSwipe = () => {
    if (!lastSwipe) return;
    onUndoAction(lastSwipe.id)
      .then(() => {
        setLastSwipe(null);
        showToast("Last feed action undone");
      })
      .catch(error => showToast(`Could not undo this action: ${error.message}`));
  };

  const shareProduct = async (product) => {
    const text = `${product.name} by ${product.brand} · $${product.price}`;
    try {
      if (navigator.share) await navigator.share({ title: product.name, text });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        showToast("Product details copied");
      } else showToast("Sharing is unavailable in this browser");
    } catch {
      /* Closing the native share sheet needs no message. */
    }
  };

  let content;
  if (page === "Discover")
    content = (
      <Discover
        product={currentProduct}
        products={products}
        nextProduct={feed[1]}
        profile={profile}
        noMatches={matchingCount === 0}
        canUndo={Boolean(lastSwipe)}
        onTune={() => setTuning(true)}
        onRevisit={() => {
          setProfile(current => ({ ...current, seen: [] }));
          setLastSwipe(null);
          setCatalogReload(current => current + 1);
        }}
        onReset={resetPreferences}
        onDetails={(product, type) => setDrawer({ product, type })}
        onNavigate={navigateTo}
        onSave={openCollectionPicker}
        onShare={shareProduct}
        onSwipe={swipe}
        onUndo={undoSwipe}
        saved={saved}
      />
    );
  else if (page === "Scroll")
    content = (
      <ProductScroll
        onDetails={(product, type) => setDrawer({ product, type })}
        onHeart={heartFromScroll}
        onSkip={product => persistAction(product, "skip", "Skipped. Your feed will learn from this.")}
        onSave={openCollectionPicker}
        onShare={shareProduct}
        loading={catalogLoading}
        error={catalogError}
        onRetry={() => {
          setCatalogLoading(true);
          setCatalogError("");
          setCatalogReload(current => current + 1);
        }}
        products={scrollProducts}
        saved={saved}
        liked={profile.likes}
      />
    );
  else if (page === "Missions")
    content = <Missions onDiscover={() => navigateTo("Discover")} />;
  else if (page === "Collections")
    content = (
      <Collections
        catalogProducts={products}
        collectionId={collectionId}
        collections={profile.collections || []}
        onCreateCollection={createCollection}
        onDeleteCollection={deleteCollection}
        onDiscover={() => navigateTo("Discover")}
        onRemoveFromCollection={removeFromCollection}
      />
    );
  else if (page === "Budget")
    content = <Budget catalogProducts={products} onRemove={removeFromAllCollections} saved={saved} />;
  else if (page === "Friends") content = <Friends />;
  else content = <Profile profile={profile} username={user.user_metadata?.username || user.user_metadata?.name || "Shopper"} onTune={() => setTuning(true)} />;

  return (
    <div className={`${styles.shell} ${page === "Scroll" ? styles.scrollShell : ""}`}>
      <Sidebar page={page} count={profile.likes.length} catalogSize={catalogProducts?.length || 100} username={user.user_metadata?.username || user.user_metadata?.name || "Shopper"} />
      <main className={styles.main}>
        <Topbar
          onMessages={() => navigateTo("Friends")}
          onSearch={() => setSearchOpen(true)}
          scrollMode={page === "Scroll"}
        />
        {content}
      </main>
      <nav
        className={styles.mobileNav}
        aria-label="Mobile ShopScroller navigation"
      >
        {navItems.slice(0, 6).map((item) => (
          <Link
            className={`${styles.mobileLink} ${page === item.label ? styles.activeMobile : ""}`}
            aria-current={page === item.label ? "page" : undefined}
            href={item.href}
            key={item.label}
          >
            <Icon name={item.icon} />
            <span>{item.label === "Collections" ? "Saved" : item.label}</span>
          </Link>
        ))}
      </nav>
      {tuning && <FeedPreferences preferences={profile.preferences} onClose={() => setTuning(false)} onApply={preferences => {
        onUpdatePreferences(preferences)
          .then(() => {
            setProfile(current => ({ ...current, seen: [] }));
            setCatalogReload(current => current + 1);
            setLastSwipe(null); setTuning(false); showToast("Preferences updated. Your feed is ready.");
          })
          .catch(error => showToast(`Could not save preferences: ${error.message}`));
      }} />}
      {drawer && (
        <ProductDrawer
          onClose={() => setDrawer(null)}
          onDislike={dislikeProductCategory}
          onSave={openCollectionPicker}
          onTooExpensive={markTooExpensive}
          product={drawer.product}
          showPriceFeedback={page === "Scroll"}
          type={drawer.type}
        />
      )}
      {collectionPickerProduct && (
        <CollectionPicker
          key={collectionPickerProduct.id}
          collections={profile.collections || []}
          onApply={selectedIds => saveProductToCollections(collectionPickerProduct, selectedIds)}
          onClose={() => setCollectionPickerProduct(null)}
          onCreateCollection={createCollection}
          product={collectionPickerProduct}
        />
      )}
      {searchOpen && (
        <SearchOverlay
          onClose={() => setSearchOpen(false)}
          products={searchableProducts}
          onSelect={(product) => {
            setDrawer({ product, type: "details" });
            setSearchOpen(false);
          }}
        />
      )}
      {toast && (
        <p className={styles.toast} role="status">
          <Icon name="check" size={16} />
          {toast}
        </p>
      )}
    </div>
  );
}
