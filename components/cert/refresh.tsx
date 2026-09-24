"use client";

/**
 * A certificate whose opening is still being recorded asks the server again every five
 * seconds, for a minute, and stops as soon as the page has it (this unmounts with the
 * pending line). Paused while the tab is hidden.
 */
import {useRouter} from "next/navigation";
import {useEffect} from "react";

export function RefreshWhilePending({every = 5000, times = 12}: {every?: number; times?: number}) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      if (document.hidden) return;
      if (++n > times) {
        clearInterval(t);
        return;
      }
      router.refresh();
    }, every);
    return () => clearInterval(t);
  }, [router, every, times]);
  return null;
}
