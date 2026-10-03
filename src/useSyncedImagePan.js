import { useLayoutEffect, useRef } from "react";

const clamp = (value) => Math.max(0, Math.min(1, value));

export default function useSyncedImagePan(enabled, sourceId) {
  const beforeRef = useRef(null);
  const afterRef = useRef(null);

  useLayoutEffect(() => {
    const panes = [beforeRef.current, afterRef.current];
    if (panes.some((pane) => !pane)) return;
    let position = { x: 0, y: 0 };
    let drag = null;
    const expected = new Map();
    const extent = (pane) => ({
      x: Math.max(0, pane.scrollWidth - pane.clientWidth),
      y: Math.max(0, pane.scrollHeight - pane.clientHeight),
    });
    const applyPosition = () => {
      for (const pane of panes) {
        const range = extent(pane);
        pane.scrollLeft = position.x * range.x;
        pane.scrollTop = position.y * range.y;
        // Scroll events arrive later; ignore the positions we set ourselves.
        expected.set(pane, { x: pane.scrollLeft, y: pane.scrollTop });
      }
    };
    const moveFrom = (pane, left, top) => {
      const range = extent(pane);
      // Different resolutions share relative positions, not pixel offsets.
      position = {
        x: range.x ? clamp(left / range.x) : position.x,
        y: range.y ? clamp(top / range.y) : position.y,
      };
      applyPosition();
    };
    const stopDrag = () => {
      if (!drag) return;
      const { pane, pointerId } = drag;
      drag = null;
      delete pane.dataset.panning;
      if (pane.hasPointerCapture(pointerId))
        pane.releasePointerCapture(pointerId);
    };
    const onPointerDown = (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0 || drag) return;
      const pane = event.currentTarget;
      const bounds = pane.getBoundingClientRect();
      // Leave native scrollbar dragging alone.
      if (
        event.clientX - bounds.left >= pane.clientWidth ||
        event.clientY - bounds.top >= pane.clientHeight
      )
        return;
      const range = extent(pane);
      if (!range.x && !range.y) return;
      event.preventDefault();
      pane.setPointerCapture(event.pointerId);
      drag = {
        pane,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: pane.scrollLeft,
        top: pane.scrollTop,
      };
      pane.dataset.panning = "true";
    };
    const onPointerMove = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!(event.buttons & 1)) {
        stopDrag();
        return;
      }
      event.preventDefault();
      moveFrom(
        drag.pane,
        drag.left + drag.x - event.clientX,
        drag.top + drag.y - event.clientY,
      );
    };
    const onPointerEnd = (event) => {
      if (event.pointerId === drag?.pointerId) stopDrag();
    };
    const onScroll = (event) => {
      const pane = event.currentTarget;
      const target = expected.get(pane);
      if (
        target &&
        Math.abs(pane.scrollLeft - target.x) < 1 &&
        Math.abs(pane.scrollTop - target.y) < 1
      )
        return;
      moveFrom(pane, pane.scrollLeft, pane.scrollTop);
    };

    applyPosition();
    if (!enabled) return;
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(applyPosition)
        : null;
    for (const pane of panes) {
      pane.addEventListener("pointerdown", onPointerDown);
      pane.addEventListener("pointermove", onPointerMove);
      pane.addEventListener("pointerup", onPointerEnd);
      pane.addEventListener("pointercancel", onPointerEnd);
      pane.addEventListener("lostpointercapture", onPointerEnd);
      pane.addEventListener("scroll", onScroll);
      pane.addEventListener("load", applyPosition, true);
      observer?.observe(pane);
    }
    return () => {
      stopDrag();
      observer?.disconnect();
      for (const pane of panes) {
        pane.removeEventListener("pointerdown", onPointerDown);
        pane.removeEventListener("pointermove", onPointerMove);
        pane.removeEventListener("pointerup", onPointerEnd);
        pane.removeEventListener("pointercancel", onPointerEnd);
        pane.removeEventListener("lostpointercapture", onPointerEnd);
        pane.removeEventListener("scroll", onScroll);
        pane.removeEventListener("load", applyPosition, true);
      }
    };
  }, [enabled, sourceId]);

  return [beforeRef, afterRef];
}
