/**
 * A BROWSER'S OWN ERROR, WRITTEN TO THE SERVER LOG.
 *
 * A page that fails in one person's browser — a wallet extension, a stale tab, something
 * nobody here can reproduce — used to leave nothing behind but their screenshot of the error
 * page. The error page now sends the failure here, and it lands in the server's log beside
 * everything else. Only the error itself: its message, the first lines of its stack, the
 * page, and the browser's name. No address, no wallet, nothing the person typed.
 */
export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 4_096) return new Response(null, {status: 413});
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return new Response(null, {status: 400});
  }
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
  console.error(
    "[client-error]",
    JSON.stringify({
      message: clip(body.message, 500),
      stack: clip(body.stack, 1_500),
      digest: clip(body.digest, 64),
      path: clip(body.path, 200),
      where: clip(body.where, 40),
      agent: clip(req.headers.get("user-agent"), 200),
      at: new Date().toISOString(),
    }),
  );
  return new Response(null, {status: 204});
}
