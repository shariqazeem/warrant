"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { PHASE_WORDS, type Phase, dismiss, snapshot, subscribe } from "./store";
import "./toast.css";

const EMPTY: readonly never[] = [];

/** The host, mounted once in the root layout. Renders nothing until something is happening. */
export function Toasts() {
  const toasts = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  if (toasts.length === 0) return null;
  return (
    <div className="sp-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`sp-toast is-${t.phase}`}>
          <span className="dot" aria-hidden />
          <span className="what">{t.what}</span>
          <span className="phase">{PHASE_WORDS[t.phase as Phase]}</span>
          {t.detail ? <span className="detail">{t.detail}</span> : null}
          {t.href ? (
            <Link href={t.href} className="open" onClick={() => dismiss(t.id)}>
              Open it
            </Link>
          ) : null}
          {t.phase === "failed" || t.phase === "settled" ? (
            <button type="button" className="close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
