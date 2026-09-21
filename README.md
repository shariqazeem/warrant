# Warrant

**A company pays its people in ownership.**

Upload a file of names and amounts, sign once, and every person is paid in a tokenized
stock in their own wallet, each with a receipt carrying the reason they were paid. Or give
someone a grant that vests on a schedule, out of an escrow the payer cannot reach into.

Built for **OKX Dev Day 2026** on **X Layer**, using **xStocks** as the asset and the **OKX
DEX aggregator** as the route. Primary track: X Layer, tokenized stocks and RWA.

---

## The demo, in six beats

1. A file of names and amounts, dropped onto `/run`. It becomes lines, with a line that
   will not pay shown in place and the rule it broke named.
2. **One signature.** USDT on X Layer implements EIP-2612, so approval is a signature
   rather than a transaction and the whole run is one transaction.
3. The receipts print. One transaction, N stubs, one run id.
4. Open one on a phone: what was paid, what it became, at what price, why, and the
   transaction it is anchored to. No session needed.
5. The company's public page: paid in ownership since, people paid, the total, every
   payment with its reason.
6. The same rail pays agents earning through x402.

## What is in here

| | |
| --- | --- |
| `contracts/src/Payroll.sol` | `payOne` / `payMany`, and the permit variants. Pulls the stablecoin, routes through the OKX aggregator, delivers the asset to the recipient's **own** address, reverts below the floor the payer signed for |
| `contracts/src/GrantEscrow.sol` | `open`, `seal`, `vest`, `revoke`, `close`. Buys the asset once and holds it in shares of a pool. `vest` is permissionless and tips whoever calls it |
| `lib/okx.ts` | The signed aggregator client, V6, server only |
| `lib/indexer.ts` | Walks the logs into SQLite. Finds its own deploy block; the cursor only advances on a window that read cleanly |
| `app/` | `/`, `/pay`, `/run`, `/grants`, `/receipt/[tx]`, `/[company]`, `/run/[id]`, and share cards for the last two |

**156 tests.** 65 Foundry, 91 Vitest. Four of the Foundry tests exist only for what an
xStock issuer can do to the escrow; four more only for what a donated token must not be
able to do to a receipt.

## Start here

1. `CLAUDE.md` — the product, the architecture, the standing policies
2. `docs/plan.md` — what to build, in order, and the scope guards
3. `docs/liquidity.md` — which xStocks can actually be paid in, measured
4. `docs/go-live.md` — what mainnet costs and the bring-up in order
5. `docs/brief.md` — every fact about the hackathon and the chain, with what was verified

## Commands

```bash
npm run dev            # the app
npm run preflight      # am I ready to spend real money? reads the chain, gates on the answer
npm run probe          # which xStocks have real liquidity, and how deep
npm run check-issuer   # what the issuer of each asset can do, read from the chain
npm run check-permit   # whether a run can be one transaction on this chain
npm run deploy         # both contracts. IRREVERSIBLE
npm run index          # walk the logs into the cache
npm run keeper         # release what is due on every grant

cd contracts && forge test
```

Proofs that cost nothing, against a fork of mainnet with the real router and real tokens:

```bash
anvil --fork-url https://rpc.xlayer.tech --silent &
npm run prove-route    # a swap settles through Payroll
npm run prove-run      # five people, one signature, one transaction
npm run prove-grant    # a grant opens, vests and empties itself
```

After changing a contract: `cd contracts && forge build && npx tsx scripts/sync-abi.ts`.

## The rules this is built to

From `CLAUDE.md`, and they are load-bearing rather than decorative:

- **Every money moment prints a receipt** anyone can open, anchored to a real transaction.
- **Never render a number the chain or a stored receipt cannot confirm.** No simulated
  balances, no projections, no sample rows. There is no example stub anywhere in this
  product, because a worked example on a page about receipts is the one lie it cannot
  afford.
- **Failure returns a value.** `Outcome<T>`; nothing throws for control flow.
- **Money-critical code requires tests before it ships.** The split arithmetic, the minimum
  out, the vesting schedule, the reason hash.
- **Two lists that drift is the dominant defect shape.** The reason hash, the ABI, the
  vesting schedule and the grant limits each exist in two languages, and each has a test
  that reads both.
- **Disclose what the issuer can do** on every asset row, read from the chain rather than
  from anyone's marketing.
- Say **"a stock position"**, never "shareholder". xStocks carry no voting rights.

## This is not Scrip

Scrip is the same author's other project: the person's side, on Solana, a rule on the
wallet you get paid to. Warrant is the company's side, on X Layer, a rail for paying people
in ownership. One engine, two products, two chains. The design system is shared and the
contracts, the chain and the product are not.

## Status

Deployed: nothing yet. Every contract, surface and script in here has been proved end to
end against a **fork of X Layer mainnet** — real USDT, the real OKX router, real calldata,
real state — which costs nothing and is the right place to find things. `docs/go-live.md`
is the bring-up.
