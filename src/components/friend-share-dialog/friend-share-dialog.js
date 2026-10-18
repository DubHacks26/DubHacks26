"use client";

import { useEffect, useState } from "react";
import { getFriendData, shareProductWithFriend } from "@/api/UserAPI";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import styles from "./friend-share-dialog.module.css";

function errorText(error) {
  return error?.response?.data?.error || error?.message || "The product could not be shared.";
}

export default function FriendShareDialog({ product, onClose, onShared }) {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getFriendData()
      .then(data => {
        if (active) setFriends(data.friends || []);
      })
      .catch(loadError => {
        if (active) setError(errorText(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !busyId) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busyId, onClose]);

  const share = async (friend) => {
    const asin = product.asin || product.id;
    if (typeof asin !== "string" || !/^[A-Z0-9]{10}$/.test(asin)) {
      setError("This product is not available in the catalog to share.");
      return;
    }
    setBusyId(friend.userId);
    setError("");
    try {
      await shareProductWithFriend(friend.userId, asin);
      onShared?.(friend);
      onClose();
    } catch (shareError) {
      setError(errorText(shareError));
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className={styles.overlay} onMouseDown={event => {
      if (event.target === event.currentTarget && !busyId) onClose();
    }}>
      <section
        aria-labelledby="share-product-title"
        aria-modal="true"
        className={styles.dialog}
        role="dialog"
      >
        <header className={styles.header}>
          <div>
            <p className="shop-kicker">Share a find</p>
            <h2 id="share-product-title">Send to a friend</h2>
          </div>
          <Button aria-label="Close share dialog" disabled={Boolean(busyId)} onClick={onClose} variant="icon">
            <Icon name="close" size={18} />
          </Button>
        </header>
        <div className={styles.product}>
          <ProductImage alt="" src={product.image} />
          <strong>{product.name}</strong>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {loading ? (
          <p className={styles.status} role="status">Loading your friends…</p>
        ) : friends.length ? (
          <ul className={styles.friends}>
            {friends.map(friend => (
              <li key={friend.userId}>
                <span className={styles.avatar}>{friend.username.slice(0, 2).toUpperCase()}</span>
                <strong>@{friend.username}</strong>
                <Button
                  disabled={Boolean(busyId)}
                  onClick={() => share(friend)}
                  variant="secondary"
                >
                  {busyId === friend.userId ? "Sending…" : "Send"}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <p>You need to add a friend before you can share a find.</p>
            <Button onClick={onClose} variant="secondary">Close</Button>
          </div>
        )}
      </section>
    </div>
  );
}
