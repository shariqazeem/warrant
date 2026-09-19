"use client";

import { useEffect, useId, useRef } from "react";
import { type Phase, dismiss, show } from "./store";

/**
 * MIRROR A FORM'S OWN PHASE INTO THE ONE TOAST. Every money form already tracks where it is
 * — quoting, signing, confirming, done — because the button says so; this puts the same word
 * where a person can see it after they have scrolled away, and links the object that was
 * written. One line per call site, and the form keeps owning its state.
 */
export type FormPhase = "idle" | "quoting" | "building" | "signing" | "confirming" | "done" | "failed";

const AS: Record<Exclude<FormPhase, "idle">, Phase> = {
  quoting: "building",
  building: "building",
  signing: "signing",
  confirming: "confirming",
  done: "settled",
  failed: "failed",
};

export function useTxToast(phase: FormPhase, what: string, opts: { href?: string; detail?: string } = {}) {
  const id = useId();
  const last = useRef<FormPhase>("idle");
  const href = opts.href;
  const detail = opts.detail;
  useEffect(() => {
    if (phase === last.current) return;
    last.current = phase;
    if (phase === "idle") {
      dismiss(id);
      return;
    }
    show(id, AS[phase], what, { href: phase === "done" ? href : undefined, detail: phase === "failed" ? detail : undefined });
  }, [phase, what, href, detail, id]);
  useEffect(() => () => dismiss(id), [id]);
}
