# What to build, in what order

> Read `CLAUDE.md` first. This file is the build order and the scope guards. The single
> biggest risk in this project is not difficulty, it is breadth.

---

## The one-sentence product

A company uploads a file of names and amounts, signs once, and every person is paid in a
tokenized stock in their own wallet, each with a receipt carrying the reason.

## The demo, written before the code

Build toward this and nothing else. Three to five minutes, no slides.

1. **The file.** Eight real names and amounts, dropped onto `/run`. It becomes eight lines
   with their reasons.
2. **One signature.** The wallet asks once.
3. **Eight receipts print**, live, on screen. Real transactions on X Layer.
4. **Open one on a phone.** The stub fills the screen: paid $25, became 0.0143 wNVDAx, the
   reason written on it, the transaction it is anchored to. Hand the phone to a judge.
5. **The company's public page.** Paid in ownership since, eight people, the total, one grant
   vesting.
6. **One sentence to close** about the same rail paying agents that earn through x402.

If a feature does not appear in those six beats, it does not get built this week.

---

## Build order

Each step ends with something that works. Do not start a step before the one above it is
green.

### Step 0 — clear the blockers (first hour)

- OKX developer API credentials. Nothing routes without them.
- Establish which xStocks on X Layer have live liquidity, and how deep. Ask in the builder
  Telegram group.
- Fund an X Layer wallet with OKB for gas and USDT for real payments.

### Step 1 — prove the route (half a day)

One script, no UI: fetch swap calldata from the OKX aggregator for USDT into a live xStock,
send it from an EOA on X Layer mainnet with a tiny amount, and confirm the asset arrives.

**If this does not work, stop and say so.** Everything below assumes it does.

### Step 2 — `Payroll.sol` (one day)

```
payOne(recipient, stableAmount, asset, minOut, reasonHash, runId, routerCalldata)
payMany(recipients[], amounts[], asset, minOuts[], reasonHashes[], runId, calldatas[])
```

- Pulls the stablecoin from the payer, who has approved the contract.
- Calls the OKX router with the supplied calldata.
- Measures the asset delivered to the recipient's own address. **Reverts below `minOut`.**
- Emits `Paid(payer, recipient, asset, stableAmount, assetAmount, reasonHash, runId)`.

Tests before moving on: the split arithmetic, the minimum-out revert, a run sharing one id,
and that the recipient's own address receives the asset rather than the contract.

### Step 3 — the indexer and the receipt page (one day)

- Walk `Paid` logs with a cursor into SQLite. Page in small block ranges; the public RPC
  refuses wide ones.
- `/receipt/[tx]` renders the stub from the log plus the transaction.
- The reason text lives in the cache; only its hash is on chain.

At the end of this step a real payment is openable by a stranger with no session. That is the
first thing worth showing anyone.

### Step 4 — `/pay` and `/run` (one day)

The two surfaces that create receipts. `/run` takes a CSV of address, amount, reason, previews
it as lines, and sends one transaction.

### Step 5 — `GrantEscrow.sol` and `/grants` (one day)

Open with a cliff and a duration, seal it with a float, `vest()` permissionless, revoke and
close. Port the logic from Scrip's program, which has already been designed and tested once.

### Step 6 — the front door and the company page (half a day)

`/` and `/@company`. Both read the indexer. No new mechanics.

### Step 7 — real recipients (half a day, and the most important half day)

Pay real bounties to real people on X Layer mainnet. Even three dollars each. Twenty receipts
belonging to twenty strangers is the evidence nothing else can substitute for.

---

## Scope guards

Things that will feel necessary and are not. Each one has sunk a hackathon build before.

- **No AI anywhere.** The payer chooses the asset, the amount and the reason. The moment a
  model decides an allocation, this becomes one of the fifty trading-bot submissions.
- **No token.** No governance, no points, no launch.
- **No agent marketplace, no reputation, no scoring.** OKX already shipped that; see
  `docs/ideas-review.md` item 5.
- **No lending, no yield, no perps, no order book.**
- **No more than one asset in the demo** until everything works with one.
- **No new design system.** It ports from Scrip. Every hour spent on visual design this week
  is an hour not spent getting real recipients.
- **No mobile app.** The site installs to a home screen already.

## What "done" means

- A real payment on X Layer mainnet, openable by a stranger, with the reason on it.
- A run of at least eight real recipients who are not the founder.
- One grant with at least one vest that a keeper released.
- A public company page that reads as a record rather than a demo.
- A README that states plainly what was built inside the window, with the commit history to
  match.
