"use client";

import { useEffect, useRef, useState } from "react";
import { categories, defaultPreferences } from "@/utils/feed.mjs";
import Button from "@/components/button/button";
import styles from "./feed-preferences.module.css";

export function PreferenceFields({ value, onChange }) {
  function toggle(key, item) {
    onChange({ ...value, [key]: value[key].includes(item) ? value[key].filter(v => v !== item) : [...value[key], item] });
  }
  return <div className={styles.fields}>
    <p className={styles.note}>Categories and price range help rank your feed. Price is a soft preference, so great finds outside your range can still appear.</p>
    {[["categories", categories]].map(([key, options]) => <fieldset key={key}>
      <legend>{key}</legend>
      <div className={styles.chips}>{options.map(option => <button key={option} type="button" aria-pressed={value[key].includes(option)} onClick={() => toggle(key, option)}>
        {option}
      </button>)}</div>
    </fieldset>)}
    <fieldset><legend>Usual price range (soft preference)</legend><div className={styles.prices}>
      <label>Minimum ($)<input type="number" min="0" step="1" required value={value.minPrice} onChange={e => onChange({ ...value, minPrice: e.target.value === '' ? '' : Number(e.target.value) })} /></label>
      <label>Maximum ($)<input type="number" min={value.minPrice || 0} step="1" required value={value.maxPrice} onChange={e => onChange({ ...value, maxPrice: e.target.value === '' ? '' : Number(e.target.value) })} /></label>
    </div></fieldset>
  </div>;
}

export default function FeedPreferences({ preferences, onApply, onClose }) {
  const [draft, setDraft] = useState(preferences);
  const dialog = useRef(null);
  useEffect(() => { const node = dialog.current; node.showModal(); return () => node.close(); }, []);
  return <dialog ref={dialog} aria-labelledby="feed-preferences-title" className={styles.dialog} onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <form onSubmit={e => { e.preventDefault(); onApply(draft); }}>
      <header><div><p className="shop-kicker">Make room for your taste</p><h2 id="feed-preferences-title">Tune my feed</h2></div><Button aria-label="Close preferences" onClick={onClose} variant="ghost">✕</Button></header>
      <PreferenceFields value={draft} onChange={setDraft} />
      <footer><Button variant="ghost" onClick={() => setDraft({ ...defaultPreferences })}>Reset</Button><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Apply preferences</Button></footer>
    </form>
  </dialog>;
}
