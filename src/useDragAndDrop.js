// useDragAndDrop.js
import { useEffect, useRef } from "react";

export const useDragAndDrop = (dropRef, handleImageUpload) => {
  const dragDepthRef = useRef(0);

  useEffect(() => {
    if (!dropRef.current) {
      return;
    }

    const el = dropRef.current;
    const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const handleDragEnter = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current += 1;
      el.classList.add("is-dragging");
    };

    const handleDragOver = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      el.classList.add("is-dragging");
    };

    const handleDragLeave = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current -= 1;

      if (dragDepthRef.current <= 0) {
        dragDepthRef.current = 0;
        el.classList.remove("is-dragging");
      }
    };

    const handleDrop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      el.classList.remove("is-dragging");

      const newImages = Array.from(e.dataTransfer.files);

      if (!newImages.length) {
        // Some platforms expose a file drag before its files become readable.
        return;
      }

      handleImageUpload(newImages);
    };
    const handlePaste = (event) => {
      if (event.target.closest?.("input, textarea, [contenteditable='true']")) return;
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile()).filter(Boolean);
      if (!files.length) return;
      event.preventDefault();
      handleImageUpload(files);
    };

    el.addEventListener("dragenter", handleDragEnter);
    el.addEventListener("dragover", handleDragOver);
    el.addEventListener("dragleave", handleDragLeave);
    el.addEventListener("drop", handleDrop);
    document.addEventListener("paste", handlePaste);

    return () => {
      el.removeEventListener("dragenter", handleDragEnter);
      el.removeEventListener("dragover", handleDragOver);
      el.removeEventListener("dragleave", handleDragLeave);
      el.removeEventListener("drop", handleDrop);
      document.removeEventListener("paste", handlePaste);
    };
  }, [dropRef, handleImageUpload]);
};
