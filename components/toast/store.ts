"use client";

/**
 * WHAT A TRANSACTION IS DOING, IN THE SAME WORDS AS THE BUTTON. One line, bottom left, that
 * follows a money action from building to settled and then leaves. It is not a notification
 * centre and it never celebrates: success is the object appearing on the page, and the toast
 * only says the chain agreed, with a link to the thing that was written.
 *
 * A failure stays until it is dismissed, because the reason is the whole value.
 */
import {xLayer} from "@/lib/chain";

export type Phase = "building" | "signing" | "confirming" | "settled" | "failed";

export type Toast = {
  readonly id: string;
  readonly phase: Phase;
  /** What is being done, in the words of the button that started it: "Pay $50". */
  readonly what: string;
  /** The reason, when it failed; or the thing that was written, when it settled. */
  readonly detail?: string;
  readonly href?: string;
  readonly at: number;
};

const SETTLED_MS = 6_000;

let toasts: readonly Toast[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  for (const l of listeners) l();
}
function set(next: readonly Toast[]) {
  toasts = next;
  emit();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function snapshot(): readonly Toast[] {
  return toasts;
}

/** Start or update one action's line. Returns the id so the caller can finish it. */
export function show(id: string, phase: Phase, what: string, extra: { detail?: string; href?: string } = {}): string {
  const clear = timers.get(id);
  if (clear) {
    clearTimeout(clear);
    timers.delete(id);
  }
  const next: Toast = { id, phase, what, at: Date.now(), ...extra };
  set([...toasts.filter((t) => t.id !== id), next]);
  if (phase === "settled") timers.set(id, setTimeout(() => dismiss(id), SETTLED_MS));
  return id;
}

export function dismiss(id: string): void {
  const clear = timers.get(id);
  if (clear) {
    clearTimeout(clear);
    timers.delete(id);
  }
  set(toasts.filter((t) => t.id !== id));
}

/** The words each phase shows. The button that started the action says the same thing. */
export const PHASE_WORDS: Record<Phase, string> = {
  building: "Building the transaction",
  signing: "Waiting for your wallet",
  // Named from the chain itself, so it cannot say another chain's name again.
  confirming: `Confirming on ${xLayer.name}`,
  settled: "Settled",
  failed: "Not sent",
};
