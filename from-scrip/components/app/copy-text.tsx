"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyText({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="sp-action"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1_600);
        });
      }}
    >
      {done ? <Check size={14} strokeWidth={2} aria-hidden /> : <Copy size={14} strokeWidth={2} aria-hidden />}
      {done ? "Copied" : label}
    </button>
  );
}
