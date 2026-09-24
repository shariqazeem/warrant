import {NextResponse, type NextRequest} from "next/server";

/**
 * A FLOOR UNDER WHAT ONE VISITOR CAN MAKE THIS SERVER DO.
 *
 * Every price is an OKX aggregator call made with the project's key, through one queue that
 * serves everybody; every record page can read X Layer's public endpoint, which answers two
 * or three reads a second from this server's address. One script in a loop could spend both
 * for every other visitor. So each visitor gets an allowance that refills, and past it the
 * answer is a plain 429 instead of a slower site for everyone.
 *
 * In memory, per server process — which is what runs here: one process behind Caddy.
 */

type Limit = {capacity: number; perSecond: number};

const LIMITS = {
  // Asking for prices. A 100-person run asks once per person, so the allowance holds a whole
  // run at once, then refills at one ask every two seconds.
  action: {capacity: 120, perSecond: 0.5},
  // Pages that read the record or the chain: receipts, runs, certificates, grants, the public
  // record, companies, share cards.
  record: {capacity: 120, perSecond: 2},
} satisfies Record<string, Limit>;

type Bucket = {tokens: number; at: number};
const buckets = new Map<string, Bucket>();

function take(key: string, limit: Limit, now: number): boolean {
  const b = buckets.get(key) ?? {tokens: limit.capacity, at: now};
  b.tokens = Math.min(limit.capacity, b.tokens + ((now - b.at) / 1000) * limit.perSecond);
  b.at = now;
  const allowed = b.tokens >= 1;
  if (allowed) b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 20_000) {
    // Forget anyone idle for ten minutes; their allowance would be full again anyway.
    for (const [k, v] of buckets) if (now - v.at > 600_000) buckets.delete(k);
  }
  return allowed;
}

/**
 * The visitor's address as Caddy saw it. Caddy replaces any X-Forwarded-For a client sends,
 * so the last entry is the connection's own address and cannot be chosen by the client.
 */
function visitor(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",").pop()?.trim() || "unknown";
}

const RECORD = /^\/(receipt|grant|g)\/|^\/run\/[^/]+|^\/record\b|^\/(@|%40|0x)|\/opengraph-image|^\/api\/client-error/;

export function middleware(req: NextRequest) {
  const isAction = req.method === "POST" && req.headers.has("next-action");
  // A link prefetch renders only the page's loading shell, never its data, so it costs
  // nothing worth counting — and counting it would spend a visitor's allowance on links
  // they only scrolled past, so the one they then click gets a 429.
  const isPrefetch = req.headers.get("next-router-prefetch") === "1";
  const path = req.nextUrl.pathname;
  const kind = isAction ? "action" : !isPrefetch && RECORD.test(path) ? "record" : null;
  if (!kind) return NextResponse.next();

  if (take(`${kind}:${visitor(req)}`, LIMITS[kind], Date.now())) return NextResponse.next();

  return new NextResponse("Too many requests from your connection. Wait a moment and try again.", {
    status: 429,
    headers: {"Retry-After": "30", "Content-Type": "text/plain; charset=utf-8"},
  });
}

export const config = {
  // Everything except the build's own static files and the icons.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon).*)"],
};
