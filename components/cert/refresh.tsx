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

/**
 * A grant still changing (vesting, or with something due that the release service is about to
 * send) asks the server again every so often while its tab is open, so a release shows without
 * a reload and no button offers what is no longer there. The page stops rendering this once
 * nothing about the grant can change. Paused while the tab is hidden.
 */
export function RefreshWhileLive({every}: {every: number}) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}
