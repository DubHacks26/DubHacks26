import { useState } from "react";
import { products } from "@/utils/shopScrollerData";
import Brand from "@/components/brand/brand";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import styles from "./onboarding.module.css";

const interests = [
  "Fashion",
  "Technology",
  "Beauty",
  "Home Decor",
  "Gaming",
  "Fitness",
  "Food & Kitchen",
  "Books",
  "Lifestyle",
];
const preferences = [
  "Budget-friendly",
  "Premium quality",
  "Minimalist",
  "Sustainable",
  "Practical",
  "Aesthetic",
];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState([
    "Technology",
    "Home Decor",
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
        <Button onClick={onDone} variant="ghost">
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
          <Button disabled={!selected.length} onClick={() => setStep(2)}>
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
          <div className={styles.preferences}>
            {preferences.map((preference, index) => (
              <label key={preference}>
                <input
                  defaultChecked={[0, 2, 5].includes(index)}
                  type="checkbox"
                />
                <span>
                  <Icon name="check" size={15} />
                </span>
                {preference}
              </label>
            ))}
          </div>
          <div className={styles.rangeCopy}>
            <span>Comfortable product range</span>
            <strong>$20 — $150</strong>
          </div>
          <input
            className={styles.range}
            defaultValue="150"
            max="300"
            min="20"
            type="range"
          />
          <Button onClick={() => setStep(3)}>
            Build my feed <Icon name="sparkles" />
          </Button>
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
          <p>
            We found your first set of thoughtful recommendations. The more you
            swipe, the better it gets.
          </p>
          <Button onClick={onDone}>
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
