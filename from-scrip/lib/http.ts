import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { rpcAgent } from "./agent";

/**
 * ONE SOCKET, MANY CALLS. Node's global `fetch` is undici, and undici ignores the `agent`
 * that web3.js passes it, so every RPC call opened a fresh TLS connection. Solana's public
 * endpoints answer that with "Connection rate limits exceeded" long before they mind the
 * number of requests: the limit that bites first is connections per ten seconds, not calls.
 *
 * This is `fetch` for JSON-RPC only — POST, a string body, JSON headers — over `node:https`
 * with a keep-alive agent, which measurably reuses one socket across calls. It returns the
 * small part of `Response` that web3.js reads: `status`, `statusText`, `ok`, `text()`.
 */
export type MinimalResponse = { status: number; statusText: string; ok: boolean; text: () => Promise<string> };

const agents = new Map<string, ReturnType<typeof rpcAgent>>();
function agentFor(url: string) {
  const origin = new URL(url).origin;
  let a = agents.get(origin);
  if (!a) {
    a = rpcAgent(url);
    agents.set(origin, a);
  }
  return a;
}

export function keepAlivePost(input: unknown, init: unknown): Promise<MinimalResponse> {
  const url = String(input);
  const opts = (init ?? {}) as { method?: string; body?: unknown; headers?: Record<string, string> };
  const target = new URL(url);
  const body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body ?? {});
  const request = target.protocol === "http:" ? httpRequest : httpsRequest;
  return new Promise<MinimalResponse>((resolve, reject) => {
    const req = request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "http:" ? 80 : 443),
        path: `${target.pathname}${target.search}`,
        method: opts.method ?? "POST",
        agent: agentFor(url),
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), ...(opts.headers ?? {}) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status, statusText: res.statusMessage ?? "", ok: status >= 200 && status < 300, text: async () => text });
        });
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}
