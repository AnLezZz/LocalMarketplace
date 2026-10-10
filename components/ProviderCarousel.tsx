"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One swipeable row. Touch and trackpad scroll it natively (with snapping); the arrows scroll a screenful for mouse users and
 * hide at the ends. The track is focusable, so arrow keys scroll it too.
 */
export default function ProviderCarousel({ label, children }: { label: string; children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const measure = useCallback(() => {
    const el = track.current;
    if (el) setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);
  const go = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return (
    <div className="lp-car" role="region" aria-roledescription="carousel" aria-label={label}>
      <button type="button" className="lp-car__btn lp-car__btn--prev" aria-label="Previous providers" hidden={edge.start} onClick={() => go(-1)}>‹</button>
      <div className="lp-car__track" ref={track} onScroll={measure} tabIndex={0}>{children}</div>
      <button type="button" className="lp-car__btn lp-car__btn--next" aria-label="Next providers" hidden={edge.end} onClick={() => go(1)}>›</button>
    </div>
  );
}
