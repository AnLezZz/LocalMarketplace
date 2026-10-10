"use client";
import { Children, cloneElement, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * A looping row of providers. Touch and trackpad scroll it natively with snapping; the arrows scroll a screenful for mouse users.
 * When the cards overflow, the row is rendered as three copies and quietly re-centred whenever the scroll settles, so it runs on
 * forever in both directions. The two extra copies are hidden from keyboards and screen readers. Fewer cards than fit: no loop, no arrows.
 */
export default function ProviderCarousel({ label, children }: { label: string; children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const items = Children.toArray(children);
  const [loop, setLoop] = useState(false);

  // Does the row overflow? Measured on the original cards only (before any copies exist), and again when the width changes.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const check = () => {
      const first = el.children[0] as HTMLElement | undefined, last = el.children[items.length - 1] as HTMLElement | undefined;
      if (!first || !last) return;
      const content = last.offsetLeft + last.offsetWidth - first.offsetLeft;
      setLoop(items.length > 1 && content > el.clientWidth + 4);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length]);

  const period = () => {
    const el = track.current;
    const a = el?.children[0] as HTMLElement | undefined, b = el?.children[items.length] as HTMLElement | undefined;
    return a && b ? b.offsetLeft - a.offsetLeft : 0;
  };
  const jump = (to: number) => {
    const el = track.current;
    if (!el) return;
    el.style.scrollBehavior = "auto"; // no animation for the quiet re-centre
    el.scrollLeft = to;
    el.style.scrollBehavior = "";
  };
  // Start on the middle copy, so there is room to scroll both ways.
  useLayoutEffect(() => { if (loop) jump(period()); }, [loop]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);

  const onScroll = useCallback(() => {
    if (!loop) return;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = track.current, p = period();
      if (!el || !p) return;
      if (el.scrollLeft < p * 0.5) jump(el.scrollLeft + p);
      else if (el.scrollLeft >= p * 1.5) jump(el.scrollLeft - p);
    }, 140);
  }, [loop]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  // The copies before and after the real row are decoration: not focusable, not announced.
  const copy = (k: string) => items.map((c, i) => (isValidElement(c) ? cloneElement(c as React.ReactElement<Record<string, unknown>>, { key: `${k}${i}`, "aria-hidden": true, tabIndex: -1 }) : c));
  return (
    <div className="lp-car" role="region" aria-roledescription="carousel" aria-label={label}>
      {loop && <button type="button" className="lp-car__btn lp-car__btn--prev" aria-label="Previous providers" onClick={() => go(-1)}>‹</button>}
      <div className="lp-car__track" ref={track} onScroll={onScroll} tabIndex={0}>
        {loop && copy("a")}
        {items}
        {loop && copy("c")}
      </div>
      {loop && <button type="button" className="lp-car__btn lp-car__btn--next" aria-label="Next providers" onClick={() => go(1)}>›</button>}
    </div>
  );
}
