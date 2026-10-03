export default function Errors({ errors, onDismiss }) {
  if (!errors.length) {
    return null;
  }

  return (
    <div className={styles.panel} role="alert">
      <ul>
        {errors.slice(0, 3).map((error, index) => (
          <li key={index}>
            <strong>Warning:</strong> {error}
          </li>
        ))}
      </ul>
      {errors.length > 3 && <details><summary>{errors.length - 3} more warnings</summary><ul>
        {errors.slice(3).map((error, index) => <li key={index}>{error}</li>)}
      </ul></details>}
      {onDismiss && <button onClick={onDismiss}>Dismiss warnings</button>}
    </div>
  );
}
import styles from "./Errors.module.css";
