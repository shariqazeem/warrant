"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { JUMP_PAGES, resolveJump, whatJumpOpens } from "./jump-resolve";
import "./jump.css";

/**
 * ⌘K — GO TO. One field that takes what a person already has in their clipboard: a handle,
 * a receipt signature, a run id, a grant address, or the name of a page. The shape decides
 * (`jump-resolve.ts`, held by a test); nothing is looked up until the page opens.
 */
const PAGES = JUMP_PAGES;
const resolve = resolveJump;

export function Jump() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const needle = q.trim().toLowerCase();
  const direct = useMemo(() => (needle && !needle.startsWith("/") && !PAGES.some(([, n]) => n.toLowerCase().includes(needle)) ? resolve(q) : null), [needle, q]);
  const matches = useMemo(() => (needle ? PAGES.filter(([href, name, what]) => name.toLowerCase().includes(needle) || what.includes(needle) || href.includes(needle)) : PAGES).slice(0, 8), [needle]);
  const rows: Array<{ href: string; name: string; what: string }> = direct ? [{ href: direct, name: q.trim(), what: whatJumpOpens(direct) }] : matches.map(([href, name, what]) => ({ href, name, what }));

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  /** Enter, a phone keyboard's Go, or a click: the selected row, else what the text resolves to. */
  const submit = () => {
    const r = rows[cursor] ?? rows[0];
    const target = r?.href ?? resolve(q);
    if (target) go(target);
  };

  if (!open) return null;
  return (
    <div className="sp-jump" role="dialog" aria-label="Go to" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="sp-jump-card">
        <form
          className="sp-jump-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            ref={input}
            className="sp-jump-input"
            placeholder="@handle, a receipt signature, a run id, a grant, or a page"
            value={q}
            spellCheck={false}
            autoComplete="off"
            autoFocus
            enterKeyHint="go"
            onChange={(e) => { setQ(e.target.value); setCursor(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, rows.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); submit(); }
            }}
          />
        </form>
        <ul className="sp-jump-rows" role="listbox">
          {rows.length === 0 ? <li className="sp-jump-empty">Nothing by that shape. A handle is 3 to 20 lowercase letters and digits.</li> : null}
          {rows.map((r, i) => (
            <li key={r.href} role="option" aria-selected={i === cursor} className={`sp-jump-row${i === cursor ? " on" : ""}`} onMouseEnter={() => setCursor(i)} onMouseDown={(e) => { e.preventDefault(); go(r.href); }}>
              <span className="name">{r.name}</span>
              <span className="what">{r.what}</span>
              <span className="href mono">{r.href}</span>
            </li>
          ))}
        </ul>
        <p className="sp-jump-hint">
          <kbd>↵</kbd> open · <kbd>esc</kbd> close · <kbd>⌘K</kbd> anywhere
        </p>
      </div>
    </div>
  );
}
