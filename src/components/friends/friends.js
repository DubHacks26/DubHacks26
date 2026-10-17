"use client";

import { useState } from "react";
import { products } from "@/utils/shopScrollerData";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import PageHeader from "@/components/page-header/page-header";
import styles from "./friends.module.css";

const activity = [
  ["AM", "Alex saved a new find", "Noma Glow Lamp · 14 min ago"],
  ["MK", "Maya created a collection", "Spring reset · 1 hr ago"],
  ["JR", "Jordan matched with you", "You both saved Studio Pro · 3 hr ago"],
];

export default function Friends() {
  const [vote, setVote] = useState(null);
  const [inviteMessage, setInviteMessage] = useState("");

  return (
    <section className="shop-page">
      <PageHeader
        action={
          <Button
            onClick={() =>
              setInviteMessage("Friend invitations are coming soon.")
            }
          >
            <Icon name="plus" size={17} /> Invite friends
          </Button>
        }
        description="See what your people love and decide together."
        eyebrow="Social shopping"
        title="Good finds are better shared."
      />
      {inviteMessage && (
        <p className={styles.notice} role="status">
          {inviteMessage}
        </p>
      )}
      <div className={styles.grid}>
        <div className={`${styles.activity} shop-panel`}>
          <h2>Latest from your circle</h2>
          {activity.map(([initials, title, detail]) => (
            <div key={title}>
              <span>{initials}</span>
              <p>
                <strong>{title}</strong>
                <small>{detail}</small>
              </p>
              <Icon filled name="heart" size={17} />
            </div>
          ))}
        </div>
        <div className={`${styles.compatibility} shop-panel`}>
          <span className={styles.score}>84%</span>
          <h2>You + Alex</h2>
          <p>Very compatible taste</p>
          <div>
            <span>Tech</span>
            <span>Streetwear</span>
            <span>Minimal</span>
          </div>
          <small>Estimated demo compatibility</small>
        </div>
        <div className={`${styles.vote} shop-panel`}>
          <p className="shop-kicker">Maya needs your vote</p>
          <h2>Which one for the new apartment?</h2>
          <div className={styles.options}>
            {products.slice(0, 2).map((product, index) => {
              const percentage =
                vote === null ? [62, 38][index] : vote === index ? 63 : 37;
              return (
                <button
                  aria-pressed={vote === index}
                  key={product.id}
                  onClick={() => setVote(index)}
                  type="button"
                >
                  <ProductImage alt="" src={product.image} />
                  <strong>{product.name}</strong>
                  <span>{percentage}%</span>
                  <i>
                    <b style={{ width: `${percentage}%` }} />
                  </i>
                </button>
              );
            })}
          </div>
          <small>
            {vote === null
              ? "24 friends voted"
              : "Thanks for voting · 25 friends voted"}
          </small>
        </div>
      </div>
    </section>
  );
}
