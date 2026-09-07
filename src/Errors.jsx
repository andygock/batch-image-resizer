export default function Errors({ errors }) {
  if (!errors.length) {
    return null;
  }

  return (
    <div className={styles.panel} role="alert">
      <ul>
        {errors.map((error, index) => (
          <li key={index}>
            <strong>Warning:</strong> {error}
          </li>
        ))}
      </ul>
    </div>
  );
}
import styles from "./Errors.module.css";
