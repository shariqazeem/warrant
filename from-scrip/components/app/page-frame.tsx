import type { ReactNode } from "react";
import "@/styles/app.css";

/**
 * The frame every shelled surface wears. `.sp-page` is the one class the app shell reserves
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
    <main className="sp-page">
      <header className="sp-page-head">
        <div>
          {eyebrow ? <p className="sp-page-eyebrow">{eyebrow}</p> : null}
          <h1 className="sp-page-title">{title}</h1>
          {sub ? <p className="sp-page-sub">{sub}</p> : null}
        </div>
        {actions ? <div className="sp-actions">{actions}</div> : null}
      </header>
      {children}
    </main>
  );
}

/**
 * The honest waiting state. It names what is missing and what would make it appear. It
 * never renders a placeholder number, because a number on a Scrip surface is a claim.
 */
export function EmptyState({ icon, title, note, children }: { icon: ReactNode; title: string; note: string; children?: ReactNode }) {
  return (
    <div className="sp-empty">
      <span className="sp-empty-mark" aria-hidden>
        {icon}
      </span>
      <p className="sp-empty-title">{title}</p>
      <p className="sp-empty-note">{note}</p>
      {children ? <div className="sp-empty-actions">{children}</div> : null}
    </div>
  );
}
