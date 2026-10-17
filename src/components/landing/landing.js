import { products } from "@/utils/shopScrollerData";
import Brand from "@/components/brand/brand";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import styles from "./landing.module.css";

function FloatingProduct({ product, placement }) {
  return (
    <article className={`${styles.floatingProduct} ${styles[placement]}`}>
      <ProductImage alt="" src={product.image} />
      <span>{product.category}</span>
      <strong>{product.name}</strong>
      <small>${product.price}</small>
    </article>
  );
}

export default function Landing({ onStart }) {
  return (
    <main className={styles.landing}>
      <header className={styles.navigation}>
        <Brand />
        <nav className={styles.links} aria-label="About ShopScroller">
          <a href="#how-it-works">How it works</a>
          <a href="#why">Why ShopScroller</a>
        </nav>
        <Button onClick={onStart} variant="dark">
          Try it now <Icon name="arrowRight" size={17} />
        </Button>
      </header>

      <section className={styles.hero}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>
            <Icon name="sparkles" size={14} /> Shopping, reimagined
          </p>
          <h1>
            Find your next
            <br />
            <em>favorite thing.</em>
          </h1>
          <p className={styles.description}>
            Swipe through products you&apos;ll actually love. Discover smarter,
            shop together, and stay comfortably on budget.
          </p>
          <div className={styles.actions}>
            <Button onClick={onStart}>
              Start discovering <Icon name="arrowRight" size={18} />
            </Button>
            <div className={styles.shoppers}>
              <div className={styles.avatars}>
                <span>AM</span>
                <span>JK</span>
                <span>RL</span>
              </div>
              <p>
                <strong>12k+</strong> happy scrollers
              </p>
            </div>
          </div>
          <p className={styles.note}>
            <Icon filled name="zap" size={15} /> Gets smarter with every swipe
          </p>
        </div>

        <div className={styles.visual}>
          <FloatingProduct placement="left" product={products[1]} />
          <article className={styles.phone}>
            <div className={styles.phoneTop}>
              <span>9:41</span>
              <Brand compact />
              <Icon name="more" size={18} />
            </div>
            <ProductImage
              alt="Cream headphones on a book"
              src={products[0].image}
            />
            <div className={styles.phoneDetails}>
              <small>
                {products[0].brand} · {products[0].category}
              </small>
              <h2>{products[0].name}</h2>
              <div>
                <strong>${products[0].price}</strong>
                <span>
                  <Icon filled name="star" size={13} /> 4.8
                </span>
              </div>
              <p className={styles.phoneActions}>
                <span>
                  <Icon name="x" />
                </span>
                <span>
                  <Icon filled name="heart" />
                </span>
              </p>
              <p className={styles.swipeCue}>Swipe to discover</p>
            </div>
          </article>
          <FloatingProduct placement="right" product={products[3]} />
          <div className={styles.match}>
            <Icon name="sparkles" size={17} />
            <strong>96% match</strong>
            <span>Made for your taste</span>
          </div>
        </div>
      </section>

      <section className={styles.benefits} id="how-it-works">
        {[
          [
            "01",
            "heart",
            "Swipe to discover",
            "A fun feed of finds picked for you, not everyone else.",
          ],
          [
            "02",
            "sparkles",
            "It learns your taste",
            "Every yes and no makes tomorrow’s feed feel more like you.",
          ],
          [
            "03",
            "users",
            "Save, plan, share",
            "Build collections, stay on budget, and shop alongside friends.",
          ],
        ].map(([number, icon, title, text]) => (
          <article id={number === "02" ? "why" : undefined} key={number}>
            <span>{number}</span>
            <Icon name={icon} size={20} />
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
