import { useEffect, useState } from "react";
import { products } from "@/utils/shopScrollerData";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import DiscoverInsights from "@/components/discover-insights/discover-insights";
import styles from "./discover.module.css";

export default function Discover({
  index,
  onDetails,
  onNavigate,
  onSave,
  onShare,
  onSwipe,
  onUndo,
  saved,
}) {
  const [motion, setMotion] = useState("");
  const product = products[index % products.length];
  const nextProduct = products[(index + 1) % products.length];
  const swipe = (direction) => {
    if (motion) return;
    setMotion(direction);
    window.setTimeout(() => {
      onSwipe(direction);
      setMotion("");
    }, 260);
  };

  useEffect(() => {
    const handleKey = (event) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, [contenteditable]")
      )
        return;
      if (event.key === "ArrowLeft") swipe("left");
      if (event.key === "ArrowRight") swipe("right");
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const isSaved = saved.includes(product.id);
  return (
    <div className={styles.grid}>
      <section className={styles.feed}>
        <header className={styles.heading}>
          <div>
            <p className="shop-kicker">Curated for you</p>
            <h1>Today&apos;s finds</h1>
          </div>
          <span>
            <Icon name="sparkles" size={15} /> Feed tuned to your taste
          </span>
        </header>
        <div className={styles.stage}>
          <div className={`${styles.card} ${styles.behind}`}>
            <ProductImage alt="" src={nextProduct.image} />
          </div>
          <article
            className={`${styles.card} ${motion ? styles[`swipe${motion}`] : ""}`}
          >
            <div className={styles.imageWrap}>
              <ProductImage alt={product.name} src={product.image} />
              <span className={styles.category}>{product.category}</span>
              <span className={styles.match}>
                <Icon name="sparkles" size={13} /> {product.match}% match{" "}
                <small>Demo</small>
              </span>
              {motion && (
                <div className={`${styles.stamp} ${styles[motion]}`}>
                  <Icon
                    filled={motion === "right"}
                    name={motion === "right" ? "heart" : "x"}
                  />
                  {motion === "right" ? "Yes, please" : "Not for me"}
                </div>
              )}
            </div>
            <div className={styles.copy}>
              <div className={styles.brandRow}>
                <span>{product.brand}</span>
                <button
                  aria-label={`Save ${product.name}`}
                  className={isSaved ? styles.saved : ""}
                  onClick={() => onSave(product)}
                  type="button"
                >
                  <Icon filled={isSaved} name="bookmark" size={19} />
                </button>
              </div>
              <h2>{product.name}</h2>
              <div className={styles.rating}>
                <strong>${product.price}</strong>
                <span>
                  <Icon filled name="star" size={14} /> {product.rating}{" "}
                  <small>({product.reviews.toLocaleString()})</small>
                </span>
              </div>
              <p>{product.description}</p>
              <div className={styles.links}>
                <Button
                  onClick={() => onDetails(product, "details")}
                  variant="ghost"
                >
                  Product details <Icon name="chevronRight" size={15} />
                </Button>
                <Button
                  onClick={() => onDetails(product, "reviews")}
                  variant="ghost"
                >
                  <Icon name="message" size={15} /> Reviews
                </Button>
              </div>
            </div>
          </article>
        </div>
        <div className={styles.controls}>
          <Button
            aria-label="Undo last swipe"
            onClick={onUndo}
            title="Undo"
            variant="icon"
          >
            <Icon name="rotate" size={18} />
          </Button>
          <Button
            aria-label="Not interested"
            className={styles.nope}
            onClick={() => swipe("left")}
            title="Not interested"
            variant="icon"
          >
            <Icon name="x" size={27} />
          </Button>
          <Button
            aria-label="Interested"
            className={styles.love}
            onClick={() => swipe("right")}
            title="Interested"
            variant="icon"
          >
            <Icon filled name="heart" size={26} />
          </Button>
          <Button
            aria-label="Save product"
            onClick={() => onSave(product)}
            title="Save"
            variant="icon"
          >
            <Icon name="bookmark" size={18} />
          </Button>
          <Button
            aria-label="Share product"
            onClick={() => onShare(product)}
            title="Share"
            variant="icon"
          >
            <Icon name="share" size={18} />
          </Button>
        </div>
        <p className={styles.hint}>
          <span>←</span> not for me <span>→</span> interested
        </p>
      </section>
      <DiscoverInsights onNavigate={onNavigate} saved={saved} />
    </div>
  );
}
