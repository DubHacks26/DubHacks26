"use client";

import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import styles from "./profile.module.css";

export default function Profile({ profile, username, onTune }) {
  const p = profile.preferences;
  return <section className="shop-page">
    <div className={styles.hero}>
      <div className={styles.avatar}>{username.slice(0, 2).toUpperCase()}</div>
      <div><p className="shop-kicker">Your shopping DNA</p><h1>{username}</h1><p>Your taste, on your terms.</p></div>
      <Button onClick={onTune} variant="secondary">Tune my feed</Button>
    </div>
    <div className={styles.stats}>
      <div><strong>{profile.likes.length}</strong><span>Liked</span></div>
      <div><strong>{profile.saved.length}</strong><span>Saved</span></div>
      <div><strong>{profile.feedback.length}</strong><span>Feedback signals</span></div>
      <div><strong>${p.minPrice}–${p.maxPrice}</strong><span>Price range</span></div>
    </div>
    <div className="shop-panel"><h2>Your preferences</h2>
      {[["Categories", p.categories]].map(([label, values]) => <div className={styles.signal} key={label}><Icon name="check" size={16} /><strong>{label}:</strong> {values.join(", ") || "Open to everything"}</div>)}
      <p>Likes influence recommendations. Bookmarks stay in your wishlist. Feedback changes ranking without changing these preferences.</p>
      <Button onClick={onTune}>Edit preferences</Button>
    </div>
  </section>;
}
