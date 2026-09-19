# Warrant

> The build for **OKX Dev Day 2026**. Submission closes **25 September 2026, 23:59 UTC**.
> Finalists are told by 30 September; the live finale is 7 October in Singapore.
>
> This directory is for Warrant only. **Scrip lives at `/Users/macbookair/projects/webgold`
> and is a different submission, for a different hackathon, on a different chain.** Do not
> edit Scrip from here.
>
> Read this file, then `docs/plan.md`, then `docs/chain.md`. Before touching any surface,
> read `.claude/skills/warrant-ui/SKILL.md`.

---

## 0. The product, in ten seconds

**Warrant is how a company pays its people in ownership.**

Upload a file of names and amounts, sign once, and every person is paid in a tokenized stock
in their own wallet, each with a receipt carrying the reason they were paid. Or give one
person a grant that vests on a schedule out of an escrow the payer cannot touch.

The sentence for a judge: *payroll, where the pay is ownership.*

It runs on **X Layer**, OKX's L2, using **xStocks** as the asset and the **OKX DEX aggregator**
as the route.

## 1. Why this, and what was rejected

Eight candidate ideas were argued over two days across six models. Seven were rejected. The
full record is `docs/ideas-review.md`; a neutral version with no verdicts is
`docs/ideas-only.md`. **Do not reopen this.** The short version:

- Six of the eight were agent-treasury or agent-reputation products. They share one fatal
  flaw: no human ever touches them, so their only user is an agent you would also have to
  write, and a judge cannot verify any of it is real.
- One of them (Agent Forge) proposed rebuilding agent identity and reputation, which OKX AI
  already shipped in July. That ends a pitch in the first minute.
- Warrant was chosen because the engine already exists and is tested in Scrip, the demo is
  understood in twenty seconds without explanation, and it has real human recipients who can
  be recruited this week.

**The relationship to Scrip, stated plainly wherever it is asked:** Scrip is the person's
side on Solana, a rule on the wallet you get paid to. Warrant is the company's side on X
Layer, a rail for paying people in ownership. One engine, two products, two chains. The
commit history in this directory is all inside the build window.

## 2. What it is not

Not an AI trading bot. Not an agent treasury. Not a reputation or credit-scoring layer. Not
a dashboard. Not a yield product. It never decides what to buy: the payer chooses the asset,
the amount and the reason.

## 3. Standing policies, inherited from Scrip and non-negotiable

1. **Every money moment prints a receipt** anyone can open, anchored to a real transaction.
2. **Never render a number the chain or a stored receipt cannot confirm.** No simulated
   balances, no projections, no fabricated activity. A worked example is labelled as
   arithmetic.
3. **Failure returns a value.** `Outcome<T>` (`from-scrip/lib/outcome.ts`); nothing throws for
   control flow. `attempt()` is the last guard so a refused read holds instead of 500ing.
4. **Money-critical code requires tests** before it ships: the split arithmetic, the minimum
   out, the vesting schedule, the reason hash.
5. **Two lists that drift is the dominant defect shape.** Whenever a value lives in two
   places, write the test that reads both.
6. **Disclose what the issuer can do** on every asset row. An xStock carries issuer powers;
   say so per row, never as a banner.
7. Say **"a stock position"** or **"economic exposure"**, never "shareholder" or "equity
   ownership". xStocks do not carry voting rights.

## 4. Architecture

### Contracts, Solidity, on X Layer

Far simpler than Scrip's Anchor program: on EVM the contract calls the router directly, so
there is no instruction introspection and no delegate dance, and xStocks rebase inside
`balanceOf` so there is no multiplier arithmetic.

| Contract | What it does |
| --- | --- |
| `Payroll.sol` | `payOne(recipient, amount, asset, minOut, reasonHash, runId, routerCalldata)` and `payMany(...)`. Pulls the stablecoin from the payer, swaps through the OKX router, delivers the asset to the recipient's own address, emits `Paid`. Reverts if the delivered amount is below `minOut` |
| `GrantEscrow.sol` | `open`, `seal`, `vest`, `revoke`, `close`. The escrow is the contract's, not the payer's. `vest` is permissionless and pays the caller a fixed tip from the grant's float |

Events are the record. The indexer reads them; the pages read the indexer.

### Off chain

| Piece | Job |
| --- | --- |
| Indexer | Walks contract logs with a cursor into a SQLite cache. Shape mirrors Scrip's (`from-scrip/lib/db-schema.ts`) |
| Keeper | Calls `vest()` on every active grant on a cadence. Thin; no price posting needed |
| Route builder | Fetches swap calldata from the OKX DEX aggregator, server side, and hands it to the transaction the payer signs |
| App | Next.js 15, App Router, RSC by default. The entire design system ports from Scrip |

### Stack

Next.js 15, TypeScript strict, **viem** (not ethers), wagmi for the wallet, drizzle +
better-sqlite3, Vitest, Foundry for the contracts.

## 5. Surfaces

Keep the page count small. Five that matter, and nothing else until they are excellent.

| Route | What is on it |
| --- | --- |
| `/` | The product running. A real payment printing live, the tape of recent receipts, what a stock could not do before, and one line of honesty about issuer powers |
| `/pay` | One person: address, amount, asset, reason, optional split. A live quote. One signature |
| `/run` | A file of names becomes lines, then one signature, then N receipts sharing a run id |
| `/grants` | Open a grant with a cliff and a duration. Revoke and close the ones open |
| `/receipt/[tx]` | The stub. What was paid, to whom, in what, at what price, why, and where it is anchored. Print-like, no chrome |
| `/@company` | A company's public page: paid in ownership since, people paid, total, grants vesting, every payment with its reason |
| `/run/[id]`, `/grant/[id]` | The public records for a run and a grant |

## 6. Design

"There is no opening bell" carries over unchanged. Two materials assigned by surface: **ink**
for the network, **paper** for every document. One accent, document blue. Units are the
largest thing on any page they appear on. The **stub** is the one object and comes in five
sizes; if something is not a stub it is a ruled row or a paragraph.

Full contract: `.claude/skills/warrant-ui/SKILL.md` and `from-scrip/styles/tokens.css`.

The wordmark and the mark need to change from Scrip's, because this is a different company.
Everything else in the system stays.

## 7. Blocking dependencies, clear these first

1. **OKX developer API credentials.** The DEX aggregator refuses without
   `OK-ACCESS-KEY`. Verified: chain 196 answers, then returns
   `OK-ACCESS-KEY can not be empty`. Nothing routes until this exists.
2. **Which xStocks on X Layer have live liquidity.** 43 are addressable. Ask in the builder
   Telegram group, which also puts the founder's name in front of the organisers.
3. **A funded X Layer wallet.** OKB for gas, and USDT for the real payments.

## 8. Commands

To be filled in as they exist. Mirror Scrip's shape:

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
forge test
npm run keeper
npm run preflight     # what a deploy costs and what is missing, read from the chain
```

## 9. The week

Scrip's mainnet deploy comes first and is not negotiable. Warrant gets the days that are
left, not the days Scrip needs. If Warrant ends up weaker for it, that is the correct
trade: Stocklana's pool is larger and Scrip is nearly finished.

The one thing that decides both: **other people's money on it before submission.** Pay real
bounties to real people on X Layer mainnet, even three dollars each. Twenty receipts
belonging to twenty strangers beats any amount of polish.
