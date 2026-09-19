import type { ReactNode } from "react";
import "@/styles/app.css";

/**
 * The frame every shelled surface wears. `.wa-page` is the one class the app shell reserves
 * room for; one frame, one class, no list to sync.
 */
export function PageFrame({
  eyebrow,
  title,
  sub,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="wa-page">
      <header className="wa-page-head">
        <div>
          {eyebrow ? <p className="wa-page-eyebrow">{eyebrow}</p> : null}
          <h1 className="wa-page-title">{title}</h1>
          {sub ? <p className="wa-page-sub">{sub}</p> : null}
        </div>
        {actions ? <div className="wa-actions">{actions}</div> : null}
      </header>
      {children}
    </main>
  );
}

/**
 * The honest waiting state. It names what is missing and what would make it appear. It
 * never renders a placeholder number, because a number on a Warrant surface is a claim.
 */
export function EmptyState({ icon, title, note, children }: { icon: ReactNode; title: string; note: string; children?: ReactNode }) {
  return (
    <div className="wa-empty">
      <span className="wa-empty-mark" aria-hidden>
        {icon}
      </span>
      <p className="wa-empty-title">{title}</p>
      <p className="wa-empty-note">{note}</p>
      {children ? <div className="wa-empty-actions">{children}</div> : null}
    </div>
  );
}
