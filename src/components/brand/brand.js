import Icon from "@/components/icon/icon";
import styles from "./brand.module.css";

export default function Brand({ compact = false }) {
  return (
    <div className={`${styles.brand} ${compact ? styles.compact : ""}`}>
      <span className={styles.mark}>
        <Icon name="bag" size={compact ? 15 : 18} />
      </span>
      <span>
        Shop<span>Scroller</span>
      </span>
    </div>
  );
}
