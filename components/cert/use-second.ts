"use client";

/**
 * ONE CLOCK FOR EVERY TICKING NUMBER ON A PAGE.
 *
 * Every certificate's "vested now" reads this, so a page with five certificates wakes once a
 * second, not five times, and all of them change on the same frame. It ticks on the wall
 * clock's whole second (the chain's `block.timestamp` is whole seconds, so nothing finer
 * could be exact), and it stops entirely while the tab is hidden.
 */
import {useSyncExternalStore} from "react";

const listeners = new Set<() => void>();
let current = Math.floor(Date.now() / 1000);
let timer: ReturnType<typeof setTimeout> | null = null;

const read = () => Math.floor(Date.now() / 1000);

function emit() {
  for (const l of listeners) l();
}

function schedule() {
  if (timer !== null) return;
  // Land just after the next whole second, so the number changes when the second does.
  timer = setTimeout(() => {
    timer = null;
    const s = read();
    if (s !== current) {
      current = s;
      emit();
    }
    if (listeners.size > 0 && !document.hidden) schedule();
  }, 1000 - (Date.now() % 1000) + 15);
}

function stop() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

function onVisibility() {
  if (document.hidden) {
    stop();
    return;
  }
  current = read();
  emit();
  schedule();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    current = read();
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) schedule();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}

const snapshot = () => current;
/** On the server and during hydration there is no live clock: the caller's moment stands. */
const serverSnapshot = () => null;

/**
 * The current whole second, live — or `initial` on the server and for the first render in
 * the browser, so the HTML the server sent and the page React hydrates say the same thing.
 */
export function useSecond(initial: number): number {
  const live = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return live ?? initial;
}
