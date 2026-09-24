/**
 * A request as OKX Connect takes it, which is not always as EIP-1193 sends it.
 *
 * TYPED DATA GOES AS AN OBJECT. viem sends eth_signTypedData_v4 the way the EIP says — the
 * address, then the typed data as a JSON string — and OKX Connect refuses any second
 * parameter that is not an object ("Request params message data error", checked in
 * @okxconnect/universal-provider 1.9.1), then serialises that object itself before it goes
 * to the phone. The refusal reached the page as "An unknown RPC error occurred": every
 * choice signed at /me failed with it, and every permit quietly fell back to approve-then-pay.
 */
export function okxParams(method: string, params: unknown): unknown {
  if (method !== "eth_signTypedData_v4" || !Array.isArray(params) || typeof params[1] !== "string") return params;
  try {
    return [params[0], JSON.parse(params[1])];
  } catch {
    return params; // not JSON: let the SDK refuse it in its own words
  }
}
