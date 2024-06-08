// useDragAndDrop.js
import { useEffect } from "react";

export const useDragAndDrop = (dropRef, handleImageUpload) => {
  useEffect(() => {
    if (!dropRef.current) {
      return;
    }

    const el = dropRef.current;

    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.style.backgroundColor = "#cfc";
    };

    const handleDragLeave = () => {
      el.style.backgroundColor = "";
    };

    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.style.backgroundColor = "";

      let newImages = Array.from(e.dataTransfer.files);

      if (!newImages.length) {
        // no files were dropped, this can happen if the user drops a non-file, such as a image within the browser
        return;
      }

      handleImageUpload(newImages);
    };

    el.addEventListener("dragover", handleDragOver);
    el.addEventListener("dragleave", handleDragLeave);
    el.addEventListener("drop", handleDrop);

    return () => {
      el.removeEventListener("dragover", handleDragOver);
      el.removeEventListener("dragleave", handleDragLeave);
      el.removeEventListener("drop", handleDrop);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
};
