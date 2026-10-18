import Icon from "@/components/icon/icon";
import styles from "./discover-insights.module.css";

export default function DiscoverInsights({ products, saved = [], profile, onTune, showBudget = true, compact = false }) {
  return (
    <aside className={`${styles.insights} ${compact ? styles.compact : ""}`}>
      <TasteCard onOpen={onTune} profile={profile} />
      {showBudget && <BudgetCard products={products} saved={saved} />}
    </aside>
  );
}

function TasteCard({ onOpen, profile }) {
  const p = profile.preferences;
  return <section className={`${styles.panel} ${styles.taste}`}>
    <div className={styles.panelHead}><span><Icon name="sparkles" size={17} /> Your taste</span><small>Live</small></div>
    <h3>{p.categories.length ? "Picked for your interests" : "Open to discovery"}</h3>
    <p>{profile.likes.length} likes shaping your feed · {profile.saved.length} wishlist finds</p>
    <div className={styles.tags}>{(p.categories.length ? p.categories : ["All categories"]).map(tag => <span key={tag}>{tag}</span>)}</div>
    <p>${p.minPrice}–${p.maxPrice} per item</p>
    <button onClick={onOpen} type="button">Tune my feed <Icon name="arrowRight" size={15} /></button>
  </section>;
}

function BudgetCard({ products, saved }) {
  const total = products
    .filter((product) => saved.includes(product.id))
    .reduce((sum, product) => sum + (Number.isFinite(product.price) ? product.price : 0), 0);

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
