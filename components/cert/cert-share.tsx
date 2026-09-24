"use client";

/**
 * The certificate page's small client pieces that need no wallet: copying, sharing and
 * printing the certificate, and forgetting a played moment. Kept apart from the wallet code
 * so a visitor who never connects never downloads it.
 */
import {Check} from "lucide-react";
import {useEffect, useState} from "react";

/** Copy the link, share it, print it: for everyone, wallet or not. */
export function CertShare({id}: {id: number}) {
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  const url = () => `${window.location.origin}/g/${id}`;

  return (
    <div className="wa-actions wa-cx-share">
      <button
        type="button"
        className="wa-btn"
        onClick={() =>
          void navigator.clipboard.writeText(url()).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          })
        }
      >
        {copied ? <Check size={16} strokeWidth={2} aria-hidden /> : null}
        {copied ? "Link copied" : "Copy link"}
      </button>
      {canShare ? (
        <button
          type="button"
          className="wa-btn"
          onClick={() => void navigator.share({title: `Certificate of grant No. ${String(id).padStart(6, "0")}`, url: url()}).catch(() => undefined)}
        >
          Share
        </button>
      ) : null}
      <button type="button" className="wa-btn" onClick={() => window.print()}>
        Print
      </button>
    </div>
  );
}

/**
 * `?issued=1` and `?sealed=1` play their moment once. Afterwards the address bar loses them,
 * quietly, so a reload or a shared link shows the certificate at rest.
 */
export function PlayedOnce({keys}: {keys: string[]}) {
  useEffect(() => {
    const t = setTimeout(() => {
      const u = new URL(window.location.href);
      let changed = false;
      for (const k of keys) {
        if (u.searchParams.has(k)) {
          u.searchParams.delete(k);
          changed = true;
        }
      }
      if (changed) window.history.replaceState(window.history.state, "", u.pathname + (u.search || "") + u.hash);
    }, 4000);
    return () => clearTimeout(t);
  }, [keys]);
  return null;
}
