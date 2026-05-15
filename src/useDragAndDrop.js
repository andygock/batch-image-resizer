// useDragAndDrop.js
import { useEffect, useRef } from "react";

export const useDragAndDrop = (dropRef, handleImageUpload) => {
  const dragDepthRef = useRef(0);

  useEffect(() => {
    if (!dropRef.current) {
      return;
    }

    const el = dropRef.current;

    const handleDragEnter = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current += 1;
      el.classList.add("is-dragging");
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add("is-dragging");
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current -= 1;

      if (dragDepthRef.current <= 0) {
        dragDepthRef.current = 0;
        el.classList.remove("is-dragging");
      }
    };

    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      el.classList.remove("is-dragging");

      const newImages = Array.from(e.dataTransfer.files);

      if (!newImages.length) {
        // no files were dropped, this can happen if the user drops a non-file, such as a image within the browser
        return;
      }

      handleImageUpload(newImages);
    };

    el.addEventListener("dragenter", handleDragEnter);
    el.addEventListener("dragover", handleDragOver);
    el.addEventListener("dragleave", handleDragLeave);
    el.addEventListener("drop", handleDrop);

    return () => {
      el.removeEventListener("dragenter", handleDragEnter);
      el.removeEventListener("dragover", handleDragOver);
      el.removeEventListener("dragleave", handleDragLeave);
      el.removeEventListener("drop", handleDrop);
    };
  }, [dropRef, handleImageUpload]);
};
