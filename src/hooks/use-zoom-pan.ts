import { useCallback, useEffect, useRef, useState } from "react";

export type View = { x0: number; x1: number; y0: number; y1: number };

const FULL: View = { x0: 0, x1: 1, y0: 0, y1: 1 };
const MIN_SPAN = 0.002;

function clampAxis(a: number, b: number): [number, number] {
  let span = Math.min(1, Math.max(MIN_SPAN, b - a));
  let start = Math.min(Math.max(0, a), 1 - span);
  return [start, start + span];
}

/**
 * Zoom + pan over a normalized [0,1] domain.
 * Mouse wheel / trackpad zooms X (Shift = Y), drag pans, two-finger pinch zooms on touch.
 */
export function useZoomPan(enableY = false) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View>(FULL);
  const viewRef = useRef<View>(FULL);
  viewRef.current = view;

  const reset = useCallback(() => setView(FULL), []);
  const isZoomed = view.x0 !== 0 || view.x1 !== 1 || view.y0 !== 0 || view.y1 !== 1;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const rectPos = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      return {
        fx: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
        fy: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
        width: r.width,
        height: r.height,
      };
    };

    const zoomAt = (factor: number, fx: number, fy: number, axis: "x" | "y") => {
      setView((v) => {
        if (axis === "x") {
          const anchor = v.x0 + (v.x1 - v.x0) * fx;
          const span = (v.x1 - v.x0) * factor;
          const [x0, x1] = clampAxis(anchor - span * fx, anchor + span * (1 - fx));
          return { ...v, x0, x1 };
        }
        const anchor = v.y0 + (v.y1 - v.y0) * fy;
        const span = (v.y1 - v.y0) * factor;
        const [y0, y1] = clampAxis(anchor - span * fy, anchor + span * (1 - fy));
        return { ...v, y0, y1 };
      });
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { fx, fy } = rectPos(e.clientX, e.clientY);
      const factor = Math.exp(e.deltaY * 0.0015);
      zoomAt(factor, fx, fy, enableY && e.shiftKey ? "y" : "x");
    };

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const { width, height } = rectPos(e.clientX, e.clientY);
      const dx = (e.clientX - lastX) / width;
      const dy = (e.clientY - lastY) / height;
      lastX = e.clientX;
      lastY = e.clientY;
      setView((v) => {
        const spanX = v.x1 - v.x0;
        const [x0, x1] = clampAxis(v.x0 - dx * spanX, v.x1 - dx * spanX);
        if (!enableY) return { ...v, x0, x1 };
        const spanY = v.y1 - v.y0;
        const [y0, y1] = clampAxis(v.y0 - dy * spanY, v.y1 - dy * spanY);
        return { x0, x1, y0, y1 };
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };

    // touch: single finger pan, two finger pinch
    let touchMode: "none" | "pan" | "pinch" = "none";
    let t0x = 0;
    let t0y = 0;
    let pinchDist = 0;
    let pinchCenter = { fx: 0.5, fy: 0.5 };

    const dist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchMode = "pan";
        t0x = e.touches[0]!.clientX;
        t0y = e.touches[0]!.clientY;
      } else if (e.touches.length >= 2) {
        touchMode = "pinch";
        pinchDist = dist(e.touches[0]!, e.touches[1]!);
        const cx = (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2;
        const cy = (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2;
        const p = rectPos(cx, cy);
        pinchCenter = { fx: p.fx, fy: p.fy };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (touchMode === "pan" && e.touches.length === 1) {
        e.preventDefault();
        const p = rectPos(e.touches[0]!.clientX, e.touches[0]!.clientY);
        const dx = (e.touches[0]!.clientX - t0x) / p.width;
        const dy = (e.touches[0]!.clientY - t0y) / p.height;
        t0x = e.touches[0]!.clientX;
        t0y = e.touches[0]!.clientY;
        setView((v) => {
          const spanX = v.x1 - v.x0;
          const [x0, x1] = clampAxis(v.x0 - dx * spanX, v.x1 - dx * spanX);
          if (!enableY) return { ...v, x0, x1 };
          const spanY = v.y1 - v.y0;
          const [y0, y1] = clampAxis(v.y0 - dy * spanY, v.y1 - dy * spanY);
          return { x0, x1, y0, y1 };
        });
      } else if (touchMode === "pinch" && e.touches.length >= 2) {
        e.preventDefault();
        const nd = dist(e.touches[0]!, e.touches[1]!);
        if (pinchDist > 0 && nd > 0) {
          zoomAt(pinchDist / nd, pinchCenter.fx, pinchCenter.fy, "x");
        }
        pinchDist = nd;
      }
    };

    const onTouchEnd = () => {
      touchMode = "none";
    };

    const onDblClick = () => setView(FULL);

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("dblclick", onDblClick);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("dblclick", onDblClick);
    };
  }, [enableY]);

  return { ref, view, reset, isZoomed };
}
