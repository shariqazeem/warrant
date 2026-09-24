"use client";

import {ChevronRight, Search} from "lucide-react";
import {useEffect, useMemo, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {resolve, type Destination} from "./resolve";
import "./jump.css";

/**
 * ⌘K — PASTE ANYTHING, GO TO IT.
 *
 * A transaction hash opens what it did, an address opens that wallet's record, a number
 * opens that certificate, a run's name opens the payroll run. It resolves by SHAPE and never by guesswork: a half-typed address
 * matches nothing, because the only thing worse than not finding a company is finding the
 * wrong one on a page about who got paid.
 *
 * No data is fetched here. It navigates, and the page it lands on says honestly whether
 * the thing exists — which is the same answer, arrived at by the page that can prove it.
 */
export function Jump() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => resolve(query), [query]);
  const chosen = results[Math.min(cursor, results.length - 1)];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      // The dialog has to exist before it can be focused.
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        className="wa-jump-hint"
        aria-label="Jump to anything"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => setOpen(true)}
      >
        <Search size={16} strokeWidth={1.75} aria-hidden />
        <span className="wa-jump-word">Jump to anything</span>
        <kbd aria-hidden>⌘K</kbd>
      </button>
    );
  }

  const go = (d: Destination | undefined) => {
    if (!d) return;
    setOpen(false);
    router.push(d.href);
  };

  return (
    <div
      className="wa-jump-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Jump to anything"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="wa-jump">
        <div className="wa-jump-field">
          <Search size={16} strokeWidth={2} aria-hidden />
          <input
            ref={input}
            className="wa-jump-input wa-mono"
            value={query}
            spellCheck={false}
            autoComplete="off"
            aria-label="A transaction, a wallet address or a certificate number"
            placeholder="A transaction, a wallet address or a certificate number"
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(chosen);
              }
            }}
          />
        </div>

        <ul className="wa-jump-list">
          {results.map((d, i) => (
            <li key={`${d.kind}-${d.href}`}>
              <button
                type="button"
                className={`wa-jump-item${i === Math.min(cursor, results.length - 1) ? " is-on" : ""}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(d)}
              >
                <span className="wa-jump-label">{d.label}</span>
                <span className="wa-jump-hintline">{d.hint}</span>
                <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </li>
          ))}
        </ul>

        <p className="wa-jump-foot">
          Paste a transaction to see what it did, a wallet address to see its record, or a
          certificate number to see the grant.
        </p>
      </div>
    </div>
  );
}
