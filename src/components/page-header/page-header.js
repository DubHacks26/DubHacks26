import styles from "./page-header.module.css";

export default function PageHeader({ eyebrow, title, description, action }) {
  return (
    <header className={styles.header}>
      <div>
        <p className="shop-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {action}
    </header>
  );
}
