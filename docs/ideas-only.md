# Candidate ideas for OKX Dev Day

Eight candidate projects, described only by what each one does. No evaluation, no ranking, no
recommendation. Listed alphabetically.

---

## Agent Forge

An on-chain credit and reputation layer for AI agents.

- Records every payment an agent receives as its revenue history.
- Derives a score from that history: how steady the revenue is, how often clients return.
- Lets a payer attach a performance verdict to a payment, stored permanently.
- Presents each agent as a public profile, and a global leaderboard ranked by score.

---

## Assay

A service that inspects an agent's deliverable before payment is released.

- A buyer agent calls it, per task, before accepting work and before its model reads the file.
- Runs deterministic checks first: does the deliverable match the spec, is it plagiarised, is
  the supporting evidence real, is the counterparty part of a wallet cluster.
- Runs a judgment layer second, for things a rule cannot decide.
- Screens the deliverable for instructions addressed to whatever model will read it.
- Returns a verdict with its evidence, written as a receipt on chain. Pass releases the
  escrow; fail holds it with the reason.

---

## Charter

A financial constitution for an autonomous business, enforced by a contract.

- An agent publishes its rules before anyone hires it: reserve floor, maximum single spend,
  daily limit, approved counterparties, approved assets, how revenue is split.
- Every financial action is checked against those rules and either allowed or denied.
- Denials are recorded as receipts naming the rule that refused them.
- Optionally the agent posts a bond in a tokenized asset, claimable if a dispute resolves
  against it.

---

## Comptroller

A treasury rule plus a spending policy attached to an agent's payout address.

- A share of every payment the agent receives converts into a tokenized stock.
- Spending is bounded by a per-task budget, a counterparty allowlist, a daily cap and a
  reserve floor that cannot be spent through.
- Policy is enforced on chain, so a spend that breaks it reverts.
- The tool itself is listed on the agent marketplace as a subscription other agents buy.

---

## Float

A treasury that keeps an operating reserve and invests the rest.

- The operator sets a cash reserve, a target treasury size and a list of approved assets.
- Cash above the reserve is allocated into approved tokenized stocks automatically.
- The agent pays for services it needs out of the reserve.
- When the reserve falls below its floor, exactly enough stock is sold to restore it.
- Every step appears in a timestamped audit log.

---

## Scrip AI

An AI agent that manages a treasury of tokenized stocks.

- A user deposits stablecoins and picks a risk mandate.
- The agent reads market data, decides an allocation across tokenized stocks, and executes
  the swaps itself.
- Each trade prints a receipt whose reason field is the agent's written thesis for it.
- A live feed shows the agent's trades and reasoning as they happen.

---

## Tender

A business that holds assets instead of cash and pays bills out of them.

- The balance sheet is tokenized stock, not stablecoin.
- When an invoice arrives, exactly enough stock is sold at that moment to settle it, and the
  rest of the position is untouched.
- Each payment prints a receipt: what was owed, what was sold, at what price, what remains.
- Spend caps, approved counterparties and a floor below which the position cannot be sold.

---

## Verifier

A service that checks completed work before money moves.

- An agent posts a task; before the escrow releases, the verifier fetches the deliverable.
- Runs deterministic checks, then a judgment layer.
- Returns a verdict with evidence, recorded on chain.
- Pays out on a pass, holds on a fail with the reason given.
