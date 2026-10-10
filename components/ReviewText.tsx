"use client";
import { useState } from "react";

const LONG = 220;

/** A review's words. Long ones are cut to a few lines with a "View more" that opens them in place. */
export default function ReviewText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > LONG;
  return (
    <div className="rvp__body">
      <p className={long && !open ? "rvp__text rvp__text--clamped" : "rvp__text"}>{text}</p>
      {long && <button type="button" className="rvp__more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "View less" : "View more"}</button>}
    </div>
  );
}
