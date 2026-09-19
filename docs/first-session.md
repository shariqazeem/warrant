# The first session's checklist

Paste this as the first message in a new Claude session opened in this directory.

---

Read `CLAUDE.md`, then `docs/plan.md`, then `docs/brief.md`. We are building Warrant for OKX
Dev Day, submission 25 September 23:59 UTC. Scrip is a separate project in another directory
and must not be touched.

Do these in order and stop at the first one that fails:

1. Confirm the OKX developer API credentials exist in `.env.local`
   (`OKX_API_KEY`, `OKX_API_SECRET`, `OKX_API_PASSPHRASE`). Without them nothing routes.
2. Ask the OKX DEX aggregator which tokens on chain 196 it can quote, and find which xStocks
   have real liquidity. Report the three deepest with their addresses.
3. Prove the route: fetch swap calldata for a small amount of USDT into one of those, send it
   from the funded X Layer wallet, and confirm the asset arrives. Report the transaction hash.

If step 3 works, scaffold the Next.js app and `Payroll.sol` per `docs/plan.md` step 2.
If step 3 fails, say so plainly and stop; do not build around it.

Known addresses, verified on chain:
- X Layer RPC `https://rpc.xlayer.tech`, chain id 196
- USDT `0x1E4a5963aBFD975d8c9021ce480b42188849D41d`
- wNVDAx `0xa8ddb5cd96b5222afe198316e9a57caa642850d5`

Known trap: the public RPC refuses wide `eth_getLogs` ranges with HTTP 400. Page in small
block ranges.
