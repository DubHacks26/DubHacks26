"use client";

import { useEffect, useState } from "react";
import { navItems, products } from "@/utils/shopScrollerData";
import { getFeed, matches, recordAction, defaultPreferences, captureFeedState, undoFeedAction } from "@/utils/feed.mjs";
import FeedPreferences from "@/components/feed-preferences/feed-preferences";
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

function Sidebar({ page, onPageChange, username, count }) {
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
        <p>{count} likes are shaping your recommendations.</p>
        <div>
          <i />
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

export default function AppShell({ profile, setProfile, user }) {
  const [page, setPage] = useState("Discover");
  const saved = profile.saved;
  const feed = getFeed(products, profile);
  const currentProduct = feed[0];
  const matchingCount = products.filter(p => matches(p, profile.preferences)).length;
  const [tuning, setTuning] = useState(false);

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
    setProfile(current => ({ ...current, saved: isAdding ? [...current.saved, product.id] : current.saved.filter(id => id !== product.id) }));
    showToast(isAdding ? `${product.name} saved` : `${product.name} removed`);
  };

  const act = (action) => {
    if (!currentProduct) return;
    // Save only feed-related fields so Undo cannot roll back a later bookmark.
    setLastSwipe(captureFeedState(profile));
    setProfile(current => recordAction(current, currentProduct.id, action));
    showToast(action === "like" ? "Liked. More finds like this, without adding to your wishlist." : action === "skip" ? "Skipped for now." : "Feedback noted. Similar finds will rank lower. Undo is available.");
  };
  // Discover now passes "like" or "skip" directly (swipe up = skip, heart = like).
  const swipe = direction => act(direction);

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
    setProfile(current => undoFeedAction(current, lastSwipe));
    setLastSwipe(null);
    showToast("Last feed action undone");
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
        nextProduct={feed[1]}
        profile={profile}
        noMatches={matchingCount === 0}
        canUndo={Boolean(lastSwipe)}
        onTune={() => setTuning(true)}
        onFeedback={act}
        onRevisit={() => { setProfile(current => ({ ...current, seen: [] })); setLastSwipe(null); }}
        onReset={() => { setProfile(current => ({ ...current, preferences: { ...defaultPreferences }, seen: [] })); setLastSwipe(null); }}
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
    content = <Collections onSave={toggleSaved} saved={saved} onDiscover={() => setPage("Discover")} />;
  else if (page === "Budget")
    content = <Budget onRemove={toggleSaved} saved={saved} />;
  else if (page === "Friends") content = <Friends />;
  else content = <Profile profile={profile} username={user.user_metadata?.username || user.user_metadata?.name || "Shopper"} onTune={() => setTuning(true)} />;

  return (
    <div className={styles.shell}>
      <Sidebar onPageChange={setPage} page={page} count={profile.likes.length} username={user.user_metadata?.username || user.user_metadata?.name || "Shopper"} />
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
      {tuning && <FeedPreferences preferences={profile.preferences} onClose={() => setTuning(false)} onApply={preferences => {
        setProfile(current => ({ ...current, preferences, seen: [] }));
        setLastSwipe(null); setTuning(false); showToast("Preferences updated. Your feed is ready.");
      }} />}
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
        <p className={styles.toast} role="status">
          <Icon name="check" size={16} />
          {toast}
        </p>
      )}
    </div>
  );
}