"use client";

import { useState } from "react";
import { products } from "@/utils/shopScrollerData";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import PageHeader from "@/components/page-header/page-header";
import styles from "./missions.module.css";

const ideas = [
  "Build a gaming setup under $500",
  "A birthday gift under $75",
  "A minimalist skincare routine",
  "Italian dinner for six",
];

const checklist = [
  "Bedding",
  "Lighting",
  "Storage",
  "Wall decor",
  "Desk accessories",
];

export default function Missions({ onDiscover }) {
  const [prompt, setPrompt] = useState(
    "Decorate my college dorm for under $250",
  );
  const [mission, setMission] = useState("");
  const [items, setItems] = useState(products.slice(0, 2));

  return (
    <section className="shop-page">
      <PageHeader
        description="Describe the outcome. We'll turn it into a smart, budget-aware mission."
        eyebrow="Shop with a plan"
        title="What are we shopping for?"
      />
      {!mission ? (
        <>
          <div className={styles.prompt}>
            <Icon name="sparkles" size={22} />
            <textarea
              aria-label="Shopping mission"
              onChange={(event) => setPrompt(event.target.value)}
              value={prompt}
            />
            <Button
              disabled={!prompt.trim()}
              onClick={() => setMission(prompt.trim())}
            >
              Create mission <Icon name="arrowRight" size={17} />
            </Button>
          </div>
          <p className="shop-kicker">Try an idea</p>
          <div className={styles.ideas}>
            {ideas.map((idea) => (
              <Button
                key={idea}
                onClick={() => setMission(idea)}
                variant="secondary"
              >
                {idea}
              </Button>
            ))}
          </div>
          <div className={styles.history}>
            <button
              onClick={() => setMission("Cozy reading corner")}
              type="button"
            >
              <Icon name="target" />
              <span>
                <strong>Cozy reading corner</strong>
                <small>3 of 4 categories complete · $184 planned</small>
              </span>
              Continue <Icon name="arrowRight" size={15} />
            </button>
            <button
              onClick={() => setMission("Weekend hiking kit")}
              type="button"
            >
              <Icon name="check" />
              <span>
                <strong>Weekend hiking kit</strong>
                <small>Completed last week · $126 total</small>
              </span>
              View list <Icon name="arrowRight" size={15} />
            </button>
          </div>
        </>
      ) : (
        <div className={`${styles.dashboard} shop-panel`}>
          <div className={styles.banner}>
            <div>
              <p className="shop-kicker">Active mission</p>
              <h2>{mission}</h2>
              <p>A thoughtful plan for your next favorite space.</p>
            </div>
            <div className={styles.budget}>
              <span>$112 remaining</span>
              <strong>
                $138 <small>of $250</small>
              </strong>
            </div>
          </div>
          <div className={styles.progress}>
            <i />
          </div>
          <div className={styles.checklist}>
            {checklist.map((category, index) => (
              <div key={category}>
                <span>
                  {index < 3 ? <Icon name="check" size={15} /> : index + 1}
                </span>
                <p>
                  <strong>{category}</strong>
                  <small>{index < 3 ? "Item selected" : "Still looking"}</small>
                </p>
              </div>
            ))}
          </div>
          <div className={styles.items}>
            {items.map((product) => (
              <div key={product.id}>
                <ProductImage alt="" src={product.image} />
                <span>
                  <strong>{product.name}</strong>
                  <small>{product.brand}</small>
                </span>
                <b>${product.price}</b>
                <Button
                  aria-label={`Remove ${product.name}`}
                  onClick={() =>
                    setItems((current) =>
                      current.filter((item) => item.id !== product.id),
                    )
                  }
                  variant="icon"
                >
                  <Icon name="x" size={16} />
                </Button>
              </div>
            ))}
          </div>
          <div className={styles.actions}>
            <Button onClick={onDiscover}>
              Continue discovering <Icon name="arrowRight" size={17} />
            </Button>
            <Button onClick={() => setMission("")} variant="ghost">
              New mission
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
