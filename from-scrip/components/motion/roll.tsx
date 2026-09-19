"use client";

import { useEffect, useRef, useState } from "react";
import { usd } from "@/lib/format";
import { useEntered } from "./reveal";

/**
 * A FIGURE ROLLS TO ITS REAL VALUE, once, when its scene enters. The value is the value;
 * only the way it arrives is animated. The format is named, not passed as a function, so a
 * server component can place one; the formats are the same ones the still figures use.
 */
export type RollKind = "int" | "usd" | "pct" | "pct1" | "pct2" | "compact";

export function formatRoll(kind: RollKind, n: number): string {
  switch (kind) {
    case "int":
      return Math.round(n).toLocaleString("en-US");
    case "usd":
      return usd(n);
    case "pct":
      return `${Math.round(n)}%`;
    case "pct1":
      return `${n.toFixed(1)}%`;
    case "pct2":
      return `${n.toFixed(2)}%`;
    case "compact":
      if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
      if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
      if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
      return usd(n);
  }
}

export function Roll({ value, kind, duration = 1100, className }: { value: number; kind: RollKind; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const entered = useEntered(ref);
  // The real value is what the server renders and what a reader without script sees. The
  // roll happens only for a figure that scrolls into view later; one already on screen at
  // load simply stands.
  const [shown, setShown] = useState<number>(value);
  const [armed, setArmed] = useState(false);
  const started = useRef(false);
  const target = useRef(value);
  target.current = value;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const visibleAtLoad = rect.top < window.innerHeight && rect.bottom > 0;
    if (visibleAtLoad) {
      started.current = true;
      settled.current = true;
      return;
    }
    setShown(0);
    setArmed(true);
  }, []);

  useEffect(() => {
    if (!armed || !entered || started.current) return;
    started.current = true;
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(target.current);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(target.current * eased);
      if (k < 1) raf = requestAnimationFrame(step);
      else setShown(target.current);
    };
    raf = requestAnimationFrame(step);
    const t = setTimeout(() => {
      settled.current = true;
    }, duration + 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [armed, entered, duration]);

  // After the roll, a live value simply updates in place.
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current) setShown(value);
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {formatRoll(kind, shown)}
    </span>
  );
}
