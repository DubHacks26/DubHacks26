import { PreferenceFields } from "@/components/feed-preferences/feed-preferences";
import { categories, defaultPreferences, matches } from "@/utils/feed.mjs";
import { useState } from "react";
import { products } from "@/utils/shopScrollerData";
import Brand from "@/components/brand/brand";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import styles from "./onboarding.module.css";

const interests = categories;

export default function Onboarding({ onDone }) {
  const [prefs, setPrefs] = useState({ ...defaultPreferences, categories: ["Electronics", "Home", "Fashion"] });
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState([
    "Electronics",
    "Home",
    "Fashion",
  ]);
  const toggle = (interest) =>
    setSelected((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest],
    );

  return (
    <main className={styles.onboarding}>
      <header className={styles.header}>
        <Brand />
        <span>Step {step} of 3</span>
        <Button onClick={() => onDone()} variant="ghost">
          Skip for now
        </Button>
      </header>
      <div className={styles.progress}>
        <i style={{ width: `${step * 33.33}%` }} />
      </div>
      {step === 1 && (
        <section className={styles.card}>
          <div className={styles.icon}>
            <Icon name="sparkles" />
          </div>
          <p className={styles.kicker}>Let&apos;s make this yours</p>
          <h1>What are you into?</h1>
          <p>
            Pick a few categories and we&apos;ll start shaping your feed. You
            can always change these later.
          </p>
          <div className={styles.interests}>
            {interests.map((interest) => (
              <Button
                className={selected.includes(interest) ? styles.selected : ""}
                key={interest}
                onClick={() => toggle(interest)}
                variant="secondary"
              >
                {selected.includes(interest) && <Icon name="check" size={16} />}
                {interest}
              </Button>
            ))}
          </div>
          <Button disabled={!selected.length} onClick={() => { setPrefs(current => ({ ...current, categories: selected })); setStep(2); }}>
            Continue with {selected.length} interests <Icon name="arrowRight" />
          </Button>
        </section>
      )}
      {step === 2 && (
        <section className={styles.card}>
          <div className={styles.icon}>
            <Icon name="wallet" />
          </div>
          <p className={styles.kicker}>Shop your way</p>
          <h1>What feels right?</h1>
          <p>
            These preferences help us prioritize the products you&apos;ll be
            happiest to see.
          </p>
          <form onSubmit={event => { event.preventDefault(); setStep(3); }}>
            <PreferenceFields value={prefs} onChange={setPrefs} />
            <Button type="submit">Build my feed <Icon name="sparkles" /></Button>
          </form>
        </section>
      )}
      {step === 3 && (
        <section className={`${styles.card} ${styles.ready}`}>
          <div className={styles.stack}>
            {products.slice(0, 3).map((product) => (
              <ProductImage alt="" key={product.id} src={product.image} />
            ))}
            <span>
              <Icon name="check" />
            </span>
          </div>
          <p className={styles.kicker}>All set</p>
          <h1>{products.some(p => matches(p, prefs)) ? "Your feed is ready." : "Your preferences are ready."}</h1>
          <p>
            {products.some(p => matches(p, prefs)) ? "Your first matching finds are ready. Like products to shape what comes next." : "Our small demo catalog has no exact matches yet. You can adjust your preferences in Discover."}
          </p>
          <Button onClick={() => onDone(prefs)}>
            Start swiping <Icon name="arrowRight" />
          </Button>
        </section>
      )}
      {step > 1 && (
        <Button
          className={styles.back}
          onClick={() => setStep((current) => current - 1)}
          variant="ghost"
        >
          <Icon name="arrowLeft" /> Back
        </Button>
      )}
    </main>
  );
}
