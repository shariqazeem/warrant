/**
 * A FAILURE IN THIS BROWSER, SENT TO THE SERVER LOG (app/api/client-error).
 *
 * Only the error and where it happened: its message, the first lines of its stack, the
 * page, and which part of the page caught it. Never an address, a balance or anything the
 * person typed. Reporting must never become a second failure, so nothing here throws.
 */
export function reportError(error: unknown, where: string): void {
  try {
    const e = (typeof error === "object" && error !== null ? error : {}) as {
      message?: unknown;
      stack?: unknown;
      digest?: unknown;
    };
    void fetch("/api/client-error", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        message: typeof e.message === "string" && e.message ? e.message : String(error),
        stack: typeof e.stack === "string" ? e.stack.split("\n").slice(0, 8).join("\n") : undefined,
        digest: typeof e.digest === "string" ? e.digest : undefined,
        path: window.location.pathname,
        where,
      }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // nothing: the page the person is looking at matters more than the log
  }
}

/**
 * A PAGE LEFT OPEN ACROSS A DEPLOY asks for code the new build no longer has, or calls a
 * server action by a name the new build does not know. Nothing is wrong with the person's
 * browser or wallet; the page is simply older than the site, and a reload fixes it.
 */
export function isStaleBuild(error: unknown): boolean {
  const e = (typeof error === "object" && error !== null ? error : {}) as {name?: unknown; message?: unknown};
  const text = `${typeof e.name === "string" ? e.name : ""} ${typeof e.message === "string" ? e.message : String(error)}`;
  return /ChunkLoadError|UnrecognizedActionError|Loading (CSS )?chunk \S+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Server Action "?\S+"? was not found|Failed to find Server Action/i.test(
    text,
  );
}

/** What a form says when a call fails because the page is older than the site. */
export const STALE_PAGE = "Warrant was updated while this page was open. Reload the page, then try again.";

/**
 * Reload once for a stale page, and never in a loop: a second failure within a minute is
 * shown, not reloaded again. Without storage there is no way to tell, so it does not reload.
 */
export function reloadOnce(): boolean {
  try {
    const key = `warrant:reloaded:${window.location.pathname}`;
    const last = Number(window.sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 60_000) return false;
    window.sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}
