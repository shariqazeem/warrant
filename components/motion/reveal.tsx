"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * A SCENE ENTERS ONCE, AND NEVER STAYS HIDDEN. When the element is reached it gains `is-in`,
 * and the CSS of whatever is inside decides what that means: a stub prints, a number rolls,
 * a line draws. Nothing here moves by itself; it only says "now".
 *
 * WHY THIS IS A SCROLL CHECK AND NOT AN IntersectionObserver. An observer reports a change
 * in intersection, and a scene that goes from below the fold to above it in ONE step — a jump
 * to the end of the page, a fast flick on a trackpad, a restored scroll position, an anchor
 * link — never intersects, so it never fires and its content is invisible for good. That is
 * what happened to the close of the front door. "Reached" here means the element's top has
 * passed the trigger line, which is also true of everything already scrolled past, so the
 * only way to see nothing is for the scene to be genuinely below the fold.
 *
 * Reduced motion still gets `is-in`; the durations collapse to nothing in tokens.css.
 */
/**
 * The trigger is the bottom of the window itself, not a line inset from it. An inset looks
 * slightly better — the scene is already moving as it arrives — and it costs correctness: a
 * section sitting in the last few percent of a window that cannot scroll any further would
 * never cross an inset line, and would stay invisible with nothing the reader could do. A
 * scene enters when any part of it is in view, and that can always happen.
 */
const TRIGGER = 1;

export function Reveal({ children, className = "", as: Tag = "div", delay = 0 }: { children: ReactNode; className?: string; as?: "div" | "section" | "figure" | "li"; delay?: number }) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // ONE LINE FOR EVERY SCENE. A per-scene threshold was the second way to end up invisible:
    // on a tall viewport the line sat above the scene and it never entered. Everything above
    // the line — including everything already scrolled past — is in.
    const line = () => window.innerHeight * TRIGGER;
    let frame = 0;
    let done = false;
    const stop = () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
    const check = () => {
      frame = 0;
      if (done) return;
      // Nothing left to scroll means nothing left to wait for: show it.
      const stuck = document.documentElement.scrollHeight <= window.innerHeight + 4;
      if (stuck || el.getBoundingClientRect().top < line()) {
        done = true;
        setInView(true);
        stop();
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    if (!done) {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
    }
    return stop;
  }, []);
  const C = Tag as "div";
  return (
    <C ref={ref as never} className={`${className}${inView ? " is-in" : ""}`} style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}>
      {children}
    </C>
  );
}

/** True once the nearest `.is-in` ancestor has entered; for components that animate by script. */
export function useEntered(ref: React.RefObject<HTMLElement | null>): boolean {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (el.closest(".is-in")) {
        setEntered(true);
        return true;
      }
      return false;
    };
    if (check()) return;
    const mo = new MutationObserver(() => {
      if (check()) mo.disconnect();
    });
    mo.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [ref]);
  return entered;
}
