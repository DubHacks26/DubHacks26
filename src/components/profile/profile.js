"use client";

import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import styles from "./profile.module.css";

export default function Profile({
  profile,
  username,
  onTune,
  onSignOut,
  signOutBusy = false,
  signOutError = "",
}) {
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
      <p>Likes appear in your Liked collection and influence recommendations. Saved finds stay organized in your collections.</p>
      <Button onClick={onTune}>Edit preferences</Button>
    </div>
    {onSignOut && (
      <div className={`shop-panel ${styles.accountPanel}`}>
        <div>
          <h2>Account</h2>
          <p>Finished shopping? Sign out of your account on this device.</p>
        </div>
        <Button
          className={styles.signOut}
          disabled={signOutBusy}
          onClick={onSignOut}
          variant="secondary"
        >
          {signOutBusy ? "Signing out…" : "Sign out"}
        </Button>
        {signOutError && <p className={styles.signOutError} role="alert">{signOutError}</p>}
      </div>
    )}
  </section>;
}
