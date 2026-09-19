"use client";

import { useState } from "react";
import { CopyText } from "@/components/app/copy-text";

/** The public page, on or off. Off chain, reversible, one request. */
export function PublishToggle({ published: initial, url, kind }: { published: boolean; url: string; kind: "person" | "org" }) {
  const [published, setPublished] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch("/api/book/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ published: !published }) });
      if (res.ok) setPublished(!published);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="sp-linkline">
        <span className="sp-url">{url}</span>
        <CopyText text={url} label="Copy" />
        <button type="button" className="sp-action" disabled={busy} onClick={() => void toggle()}>
          {published ? "Public page on" : "Make it public"}
        </button>
      </div>
      <p className="sp-fact-note">
        {kind === "org"
          ? "An organisation's page lists what it paid and whom, by handle only where the person published their own register. Recruit with it."
          : "A person's page shows the rule, the register and the keep-rate. A proof of saving to post."}
      </p>
    </div>
  );
}
