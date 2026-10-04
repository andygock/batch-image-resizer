import { X } from "lucide-preact";
import { useEffect, useId, useRef } from "react";
import styles from "./Modal.module.css";

export default function Modal({
  title,
  onClose,
  children,
  className = "",
  onKeyDown,
}) {
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className={`${styles.modal} ${className}`}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <div className={styles.heading}>
        <h2 id={titleId}>{title}</h2>
        <button
          className="buttonIcon"
          aria-label={`Close ${title.toLowerCase()}`}
          onClick={onClose}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.content}>{children}</div>
    </dialog>
  );
}
