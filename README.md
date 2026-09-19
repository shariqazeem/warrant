# Warrant

**A company pays its people in ownership.**

Upload a file of names and amounts, sign once, and every person is paid in a tokenized stock
in their own wallet, each with a receipt carrying the reason they were paid. Or give someone
a grant that vests on a schedule, out of an escrow the payer cannot touch.

Built for **OKX Dev Day 2026** on **X Layer**, using **xStocks** as the asset and the **OKX
DEX aggregator** as the route. Primary track: X Layer, tokenized stocks and RWA.

---

## Start here

1. `CLAUDE.md` — the product, the architecture, the standing policies, the blockers
2. `docs/plan.md` — what to build, in order, and the scope guards
3. `docs/brief.md` — every fact about the hackathon and the chain, with what was verified
4. `docs/reuse.md` — what to copy from Scrip, what to adapt, what to leave
5. `.claude/skills/warrant-ui/SKILL.md` — the design system, before any surface

Background, only if the choice of product is questioned: `docs/ideas-review.md` has all eight
candidates and why seven were rejected. `docs/ideas-only.md` is the same list with the
verdicts stripped out.

## This is not Scrip

Scrip lives at `/Users/macbookair/projects/webgold`. It is a different submission, for a
different hackathon, on a different chain, with a deadline on the same day. **Do not edit it
from here.**

Scrip is the person's side: a rule on the wallet you get paid to, so a slice of every arrival
becomes a stock position. Warrant is the company's side: a rail for paying people in
ownership. One engine, two products.

## Commands

```bash
npm run dev          # the app
npm run build
npm run typecheck
npm run test         # vitest: the reason hash, the ABI
npm run preflight    # what is missing and what a deploy costs, read from the chain
npm run probe        # which xStocks on chain 196 have real liquidity   (needs credentials)
npm run prove-route  # plan step 1; prints the plan, sends nothing without --send

cd contracts && forge test    # 24 tests on Payroll.sol
```

After changing a contract: `cd contracts && forge build && cd .. && npx tsx scripts/sync-abi.ts`.

## Status

**Blocked on one thing: the OKX developer API credentials.** Every aggregator endpoint,
including the public supported-chains read, answers HTTP 401 `OK-ACCESS-KEY can not be
empty`. Nothing routes until `OKX_API_KEY`, `OKX_API_SECRET` and `OKX_API_PASSPHRASE` are
in `.env.local`, so `docs/plan.md` step 1 has not been run and no payment exists yet.

Built and green while blocked:

- `contracts/src/Payroll.sol` — plan step 2 in full, 24 Foundry tests
- `lib/okx.ts` — the signed aggregator client, server only
- `scripts/probe.ts` — answers which xStocks have live liquidity, the moment credentials exist
- `scripts/prove-route.ts` — plan step 1, dry by default
- `scripts/preflight.ts` — reads the chain; confirmed chain 196, USDT/6, wNVDAx/18
- The app scaffold and the design system, ported from Scrip with Warrant's own mark

Nothing on any surface is invented. With no payments on chain, the front door says in
words what will fill it.
