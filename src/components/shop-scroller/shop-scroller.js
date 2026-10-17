"use client";

import { useEffect, useState } from "react";
import { navItems, products } from "@/utils/shopScrollerData";
import Discover from "@/components/discover/discover";
import Missions from "@/components/missions/missions";
import Collections from "@/components/collections/collections";
import Budget from "@/components/budget/budget";
import Friends from "@/components/friends/friends";
import Profile from "@/components/profile/profile";
import ProductDrawer from "@/components/product-drawer/product-drawer";
import SearchOverlay from "@/components/search-overlay/search-overlay";
import Brand from "@/components/brand/brand";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import styles from "./shop-scroller.module.css";

function Sidebar({ page, onPageChange }) {
  return (
    <aside className={styles.sidebar}>
      <Brand />
      <nav aria-label="ShopScroller">
        {navItems.map((item) => (
          <Button
            className={page === item.label ? styles.activeNav : ""}
            key={item.label}
            onClick={() => onPageChange(item.label)}
            variant="ghost"
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
            {page === item.label && <i />}
          </Button>
        ))}
      </nav>
      <div className={styles.tasteCard}>
        <Icon name="sparkles" size={18} />
        <strong>Your taste is taking shape</strong>
        <p>12 swipes improved your recommendations this week.</p>
        <div>
          <i />
        </div>
      </div>
      <div className={styles.user}>
        <div>OM</div>
        <span>
          <strong>Olivia Martin</strong>
          <small>Taste explorer</small>
        </span>
        <Icon name="more" size={18} />
      </div>
    </aside>
  );
}

function Topbar({ onSearch, onMessages }) {
  return (
    <header className={styles.topbar}>
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

export default function AppShell() {
  const [page, setPage] = useState("Discover");
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState([]);
  const [lastSwipe, setLastSwipe] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const toggleSaved = (product) => {
    const isAdding = !saved.includes(product.id);
    setSaved((current) =>
      isAdding
        ? [...current, product.id]
        : current.filter((id) => id !== product.id),
    );
    showToast(isAdding ? `${product.name} saved` : `${product.name} removed`);
  };

  const swipe = (direction) => {
    const currentProduct = products[index % products.length];
    const added = direction === "right" && !saved.includes(currentProduct.id);
    setLastSwipe({ index, productId: currentProduct.id, added });
    if (added) setSaved((current) => [...current, currentProduct.id]);
    setIndex((current) => current + 1);
    showToast(direction === "right" ? "Saved to Interested" : "Feed updated");
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
    setIndex(lastSwipe.index);
    if (lastSwipe.added)
      setSaved((current) => current.filter((id) => id !== lastSwipe.productId));
    setLastSwipe(null);
    showToast("Last swipe undone");
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
        index={index}
        onDetails={(product, type) => setDrawer({ product, type })}
        onNavigate={setPage}
        onSave={toggleSaved}
        onShare={shareProduct}
        onSwipe={swipe}
        onUndo={undoSwipe}
        saved={saved}
      />
    );
  else if (page === "Missions")
    content = <Missions onDiscover={() => setPage("Discover")} />;
  else if (page === "Collections")
    content = <Collections onSave={toggleSaved} saved={saved} />;
  else if (page === "Budget")
    content = <Budget onRemove={toggleSaved} saved={saved} />;
  else if (page === "Friends") content = <Friends />;
  else content = <Profile />;

  return (
    <div className={styles.shell}>
      <Sidebar onPageChange={setPage} page={page} />
      <main className={styles.main}>
        <Topbar
          onMessages={() => setPage("Friends")}
          onSearch={() => setSearchOpen(true)}
        />
        {content}
      </main>
      <nav
        className={styles.mobileNav}
        aria-label="Mobile ShopScroller navigation"
      >
        {navItems.slice(0, 5).map((item) => (
          <button
            className={page === item.label ? styles.activeMobile : ""}
            key={item.label}
            onClick={() => setPage(item.label)}
            type="button"
          >
            <Icon name={item.icon} />
            <span>{item.label === "Collections" ? "Saved" : item.label}</span>
          </button>
        ))}
      </nav>
      {drawer && (
        <ProductDrawer
          onClose={() => setDrawer(null)}
          onSave={toggleSaved}
          product={drawer.product}
          type={drawer.type}
        />
      )}
      {searchOpen && (
        <SearchOverlay
          onClose={() => setSearchOpen(false)}
          onSelect={(product) => {
            setDrawer({ product, type: "details" });
            setSearchOpen(false);
          }}
        />
      )}
      {toast && (
        <p className={styles.toast}>
          <Icon name="check" size={16} />
          {toast}
        </p>
      )}
    </div>
  );
}
