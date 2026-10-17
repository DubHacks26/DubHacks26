"use client";

import { useState } from "react";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import styles from "./profile.module.css";

const signals = [
  "Warm minimalism",
  "Under $100",
  "High customer ratings",
  "Sustainable materials",
];

export default function Profile() {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("Olivia Martin");
  const [draft, setDraft] = useState(name);

  const saveName = (event) => {
    event.preventDefault();
    if (draft.trim()) {
      setName(draft.trim());
      setEditing(false);
    }
  };

  return (
    <section className="shop-page">
      <div className={styles.hero}>
        <div className={styles.avatar}>
          {name
            .split(" ")
            .map((part) => part[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </div>
        <div>
          <p className="shop-kicker">Your shopping DNA</p>
          <h1>{name}</h1>
          <p>Thoughtful finds, soft colors, practical details.</p>
        </div>
        <Button onClick={() => setEditing(true)} variant="secondary">
          Edit profile
        </Button>
      </div>
      {editing && (
        <form className={styles.edit} onSubmit={saveName}>
          <label htmlFor="profile-name">Display name</label>
          <input
            autoFocus
            id="profile-name"
            onChange={(event) => setDraft(event.target.value)}
            value={draft}
          />
          <Button type="submit">Save</Button>
          <Button onClick={() => setEditing(false)} variant="ghost">
            Cancel
          </Button>
        </form>
      )}
      <div className={styles.stats}>
        <div>
          <strong>48</strong>
          <span>Interested</span>
        </div>
        <div>
          <strong>6</strong>
          <span>Collections</span>
        </div>
        <div>
          <strong>3</strong>
          <span>Missions</span>
        </div>
        <div>
          <strong>$20–150</strong>
          <span>Sweet spot</span>
        </div>
      </div>
      <div className={styles.grid}>
        <div className="shop-panel">
          <h2>Your taste map</h2>
          <div className={styles.orbit}>
            <span>
              40%<small>Tech</small>
            </span>
            <i>
              30%<small>Home</small>
            </i>
            <i>
              20%<small>Fashion</small>
            </i>
            <i>
              10%<small>Other</small>
            </i>
          </div>
        </div>
        <div className="shop-panel">
          <h2>Top signals</h2>
          {signals.map((signal) => (
            <div className={styles.signal} key={signal}>
              <Icon name="check" size={16} />
              {signal}
            </div>
          ))}
          <Button onClick={() => setEditing(true)} variant="secondary">
            Tune preferences
          </Button>
        </div>
      </div>
    </section>
  );
}
