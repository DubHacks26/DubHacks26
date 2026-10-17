import { products } from "@/utils/shopScrollerData";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import styles from "./discover-insights.module.css";

export default function DiscoverInsights({ onNavigate, saved }) {
  return (
    <aside className={styles.insights}>
      <TasteCard onOpen={() => onNavigate("Profile")} />
      <BudgetCard saved={saved} />
      <FriendsCard onOpen={() => onNavigate("Friends")} />
      <div className={styles.tip}>
        <Icon filled name="zap" size={18} />
        <p>
          <strong>Quick tip</strong>
          <span>Use arrow keys to swipe faster.</span>
        </p>
      </div>
    </aside>
  );
}

function TasteCard({ onOpen }) {
  return (
    <section className={`${styles.panel} ${styles.taste}`}>
      <div className={styles.panelHead}>
        <span>
          <Icon name="sparkles" size={17} /> Your taste
        </span>
        <small>Live</small>
      </div>
      <h3>Warm minimalism</h3>
      <p>
        You&apos;re leaning toward thoughtful design, soft neutrals, and useful
        details.
      </p>
      <div className={styles.tags}>
        <span>Minimal</span>
        <span>Neutral</span>
        <span>Functional</span>
      </div>
      <button onClick={onOpen} type="button">
        See your taste profile <Icon name="arrowRight" size={15} />
      </button>
    </section>
  );
}

function BudgetCard({ saved }) {
  const total = products
    .filter((product) => saved.includes(product.id))
    .reduce((sum, product) => sum + product.price, 129);

  return (
    <section className={`${styles.panel} ${styles.budget}`}>
      <div className={styles.panelHead}>
        <span>
          <Icon name="wallet" size={17} /> Wishlist budget
        </span>
        <strong>${Math.max(400 - total, 0)} left</strong>
      </div>
      <div>
        <i style={{ width: `${Math.min((total / 400) * 100, 100)}%` }} />
      </div>
      <p>
        <span>${total} planned</span>
        <span>$400 goal</span>
      </p>
    </section>
  );
}

function FriendsCard({ onOpen }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <span>
          <Icon name="users" size={17} /> Friends are loving
        </span>
        <button onClick={onOpen} type="button">
          View all
        </button>
      </div>
      {products.slice(1, 3).map((product, index) => (
        <div className={styles.friend} key={product.id}>
          <ProductImage alt="" src={product.image} />
          <p>
            <strong>{index ? "Alex liked" : "Maya saved"}</strong>
            <span>{product.name}</span>
            <small>{index ? "1 hr ago" : "12 min ago"}</small>
          </p>
          <Icon filled name="heart" size={17} />
        </div>
      ))}
    </section>
  );
}
