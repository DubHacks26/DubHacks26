import styles from "./button.module.css";

export default function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}) {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${className}`}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
