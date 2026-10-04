import { useLayoutEffect, useRef } from "react";

function updateReveal(viewport, split) {
  // The divider stays in the viewport while the shared canvas scrolls beneath it.
  viewport.style.setProperty(
    "--reveal",
    `${viewport.scrollLeft + (viewport.clientWidth * split) / 100}px`,
  );
}

export default function useImagePan(enabled, sourceId, split) {
  const viewportRef = useRef(null);
  const splitRef = useRef(split);

  useLayoutEffect(() => {
    splitRef.current = split;
    if (viewportRef.current) updateReveal(viewportRef.current, split);
  }, [split]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let drag = null;
    const refresh = () => updateReveal(viewport, splitRef.current);
    const stopDrag = () => {
      if (!drag) return;
      const { pointerId } = drag;
      drag = null;
      delete viewport.dataset.panning;
      if (viewport.hasPointerCapture(pointerId))
        viewport.releasePointerCapture(pointerId);
    };
    const onPointerDown = (event) => {
      if (event.button !== 0 || drag) return;
      const bounds = viewport.getBoundingClientRect();
      // Leave native scrollbar dragging alone.
      if (
        event.clientX - bounds.left >= viewport.clientWidth ||
        event.clientY - bounds.top >= viewport.clientHeight
      )
        return;
      if (
        viewport.scrollWidth <= viewport.clientWidth &&
        viewport.scrollHeight <= viewport.clientHeight
      )
        return;
      event.preventDefault();
      viewport.setPointerCapture(event.pointerId);
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
      viewport.dataset.panning = "true";
    };
    const onPointerMove = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (event.pointerType === "mouse" && !(event.buttons & 1)) {
        stopDrag();
        return;
      }
      event.preventDefault();
      viewport.scrollLeft = Math.max(
        0,
        Math.min(
          viewport.scrollWidth - viewport.clientWidth,
          drag.left + drag.x - event.clientX,
        ),
      );
      viewport.scrollTop = Math.max(
        0,
        Math.min(
          viewport.scrollHeight - viewport.clientHeight,
          drag.top + drag.y - event.clientY,
        ),
      );
      refresh();
    };
    const onPointerEnd = (event) => {
      if (event.pointerId === drag?.pointerId) stopDrag();
    };

    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
    refresh();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(refresh) : null;
    observer?.observe(viewport);
    viewport.addEventListener("scroll", refresh);
    viewport.addEventListener("load", refresh, true);
    if (enabled) {
      viewport.addEventListener("pointerdown", onPointerDown);
      viewport.addEventListener("pointermove", onPointerMove);
      viewport.addEventListener("pointerup", onPointerEnd);
      viewport.addEventListener("pointercancel", onPointerEnd);
      viewport.addEventListener("lostpointercapture", onPointerEnd);
    }
    return () => {
      stopDrag();
      observer?.disconnect();
      viewport.removeEventListener("scroll", refresh);
      viewport.removeEventListener("load", refresh, true);
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", onPointerEnd);
      viewport.removeEventListener("pointercancel", onPointerEnd);
      viewport.removeEventListener("lostpointercapture", onPointerEnd);
    };
  }, [enabled, sourceId]);

  return viewportRef;
}
