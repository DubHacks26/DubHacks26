import { PreferenceFields } from "@/components/feed-preferences/feed-preferences";
import { categories, defaultPreferences } from "@/utils/feed.mjs";
import { useState } from "react";
import { products } from "@/utils/shopScrollerData";
import Brand from "@/components/brand/brand";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import styles from "./onboarding.module.css";

const interests = categories;
const initialInterests = ["Home & kitchen", "Tech & electronics", "Fashion & accessories"];

export default function Onboarding({ onDone }) {
  const [prefs, setPrefs] = useState({ ...defaultPreferences, categories: initialInterests });
  const [step, setStep] = useState(1);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(initialInterests);
  const toggle = (interest) =>
    setSelected((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest],
    );
  const finish = async (preferences = prefs) => {
    setSaveError("");
    setSaving(true);
    try {
      await onDone(preferences);
    } catch (error) {
      setSaveError(`Could not save your preferences: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={styles.onboarding}>
      <header className={styles.header}>
        <Brand />
        <span>Step {step} of 3</span>
        <Button disabled={saving} onClick={() => finish()} variant="ghost">
          Skip for now
        </Button>
      </header>
      <div className={styles.progress}>
        <i style={{ width: `${step * 33.33}%` }} />
      </div>
      {saveError && <p role="alert">{saveError}</p>}
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
          <p>These preferences help rank products you&apos;ll be happiest to see. Your price range is a soft preference, not a cutoff.</p>
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
          <h1>Your feed is ready.</h1>
          <p>Like, save, or skip products to teach your feed what you want to see. You can tune your preferences at any time.</p>
          <Button disabled={saving} onClick={() => finish(prefs)}>
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
