import { products } from "@/utils/shopScrollerData";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import styles from "./discover-insights.module.css";

export default function DiscoverInsights({ onNavigate, saved, profile, onTune }) {
  return (
    <aside className={styles.insights}>
      <TasteCard onOpen={onTune} profile={profile} />
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

function TasteCard({ onOpen, profile }) {
  const p = profile.preferences;
  return <section className={`${styles.panel} ${styles.taste}`}>
    <div className={styles.panelHead}><span><Icon name="sparkles" size={17} /> Your taste</span><small>Demo</small></div>
    <h3>{p.categories.length ? "Picked for your interests" : "Open to discovery"}</h3>
    <p>{profile.likes.length} likes shaping your feed · {profile.saved.length} wishlist finds</p>
    <div className={styles.tags}>{(p.categories.length ? p.categories : ["All categories"]).map(tag => <span key={tag}>{tag}</span>)}</div>
    <p>${p.minPrice}–${p.maxPrice} per item</p>
    <button onClick={onOpen} type="button">Tune my feed <Icon name="arrowRight" size={15} /></button>
  </section>;
}

function BudgetCard({ saved }) {
  const total = products
    .filter((product) => saved.includes(product.id))
    .reduce((sum, product) => sum + product.price, 0);

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
