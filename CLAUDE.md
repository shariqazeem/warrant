# Warrant

> The build for **OKX Dev Day 2026**. Submission closes **25 September 2026, 23:59 UTC**.
> Finalists are told by 30 September; the live finale is 7 October in Singapore.
>
> This directory is for Warrant only. **Scrip is a different submission, for a different
> hackathon, on a different chain.** Do not edit Scrip from here.
>
> Read this file, then `docs/state-check.md` (the claims, checked against the code and the
> chain), then `docs/proofs.md`. Before touching any surface, read
> `.claude/skills/warrant-ui/SKILL.md`. Where sources disagree, trust the deployed contracts
> and the chain first, then this file, then the design files, then older docs.

---

## 0. The product, in ten seconds

**Give your team stock that vests.**

A company picks one of its people, a stock (the S&P 500, NVIDIA or thirteen more) and an
amount. The grant buys the stock on day one through OKX DEX and holds it in an escrow nobody
can spend. It vests every second, with an optional cliff, and what has vested belongs to the
person. The company can cancel the unvested part of a revocable grant; sealing a grant makes
it irrevocable. Anyone can release what is due and earn the grant's release fee, so the stock
arrives even if nobody remembers.

- **Grants are the hero.** Every grant is a numbered certificate anyone can open without a
  wallet, and the certificate is the one object people remember.
- **Payroll comes second.** One signature pays a whole team, each person in the split and
  stock they chose, and every line gets a payslip.
- **The person chooses the stock**, with a free EIP-712 signature at `/me` that sends
  nothing. Payroll honours it; a company granting them stock sees it.

**Who it is for:** teams of 5 to 50 people that pay in USDT across borders (crypto startups,
agencies and DAOs). They cannot give equity to people in six countries, so their best people
leave for a raise. Warrant gives them the retention tool public companies use.

It runs on **X Layer** mainnet (chain 196), with **xStocks** as the asset, the **OKX DEX
aggregator** as the route, **USD₮0** as the money and **OKX Wallet** (by QR through OKX
Connect) as the wallet. Fees are paid in OKB.

## 1. Why this, and what was rejected

Eight candidate ideas were argued over two days. Seven were rejected. The full record is
`docs/ideas-review.md`; a neutral version with no verdicts is `docs/ideas-only.md`. **Do not
reopen this.** Six of the eight were agent-treasury or agent-reputation products whose only
user would be an agent nobody could verify; one rebuilt agent identity that OKX AI already
shipped. Warrant was chosen because the engine existed and was tested, the demo is
understood in twenty seconds, and it has real human recipients.

## 2. What it is not

- **Not Scrip.** Scrip is the founder's Solana app for the person being paid ("your income
  invests itself"). Warrant is for the company paying people. It shares none of Scrip's
  look, words or tokens, and it never leads with the person's side ("Get paid in stocks" is
  retired everywhere). `docs/reuse.md` lists what was ported at the start and what replaced
  it.
- Not an AI trading bot, an agent treasury, a reputation or credit layer, a dashboard or a
  yield product.
- It never decides what anyone is paid in. The person chooses their split; the company
  chooses only for someone who has not chosen, and chooses the stock of a grant, with the
  person's choice shown beside it.

## 3. Standing policies, non-negotiable

1. **Every money moment has a record** anyone can open, anchored to a real transaction: a
   certificate for a grant, a payslip for a payroll line, a receipt for each release.
2. **Never render a number the chain, a live quote or the user's own input cannot
   confirm.** No simulated balances, no projections, no invented stats, no sample grants, no
   fabricated activity. While a value loads, show a skeleton; if it is unavailable, say so. A
   worked example is labelled as arithmetic. The only preview is the specimen certificate,
   clearly marked.
3. **Failure returns a value.** `Outcome<T>` (`lib/outcome.ts`); nothing throws for control
   flow. `attempt()` is the last guard, so a refused read holds instead of 500ing.
4. **Money-critical code requires tests** before it ships: the split arithmetic, the minimum
   out, the vesting schedule, the share-to-unit conversion, the reason hash.
5. **Two lists that drift is the dominant defect shape.** Whenever a value lives in two
   places (Solidity and TypeScript, an ABI and its events, a list and its doc), write the
   test that reads both.
6. **Disclose what the issuer can do** on every stock row: one upgradeable owner can create
   units, destroy units held by any address, replace the code and hand those powers on. Per
   row, never as a banner.
7. Say **"a stock position"** or **"economic exposure"**, never "shareholder" or "equity
   ownership". xStocks carry no voting rights, and are not available to US persons, or in
   Canada, the UK or Australia.

## 4. Architecture

### Contracts, Solidity 0.8.24, on X Layer mainnet

Neither contract has an owner, an admin role, a pause, an allowlist, a setter, a sweep, a
rescue function or an upgrade path, and neither can receive OKB.

| Contract | Address | What it does |
| --- | --- | --- |
| `GrantEscrow.sol` | `0xB238D76499616377abD4908E46F29C7CE50908D1` | `open(Terms)` / `openWithPermit(...)`: pulls the USD₮0, swaps it through the OKX router into the escrow, requires `delivered ≥ minOut`, and records the grant as **shares** of a per-stock pool (so an issuer's mint or burn moves every grant in proportion; a virtual offset of 1e6 guards the first deposit). `vest(id)`: permissionless; releases what is due to the beneficiary and pays the caller `due × tipBps / 10000`, where `tipBps` is set per grant from 0 to 200 (2%), and nothing when the caller is the beneficiary. `seal(id)`: the payer gives up the right to revoke, for good. `revoke(id)`: the payer, before a seal; the unvested stock returns to the payer and what had vested stays claimable. `close(id)`: anyone, once everything owed is released |
| `Payroll.sol` (v2) | `0xD9d06266B9290bA5ee81Cc54657844D4a874431d` | `payOne(Line line, bytes32 runId)` and `payMany(Line[] lines, bytes32 runId)`, plus `payOneWithPermit` and `payManyWithPermit`. A `Line` is `{recipient, asset, stableAmount, cashAmount, minOut, reasonHash, routerCalldata}`. Pulls the USD₮0 once, swaps each line's stock part through the OKX router with the person as the receiver, sends the cash part as USD₮0, measures delivery in the person's own balance, and reverts the whole run if any line is below its `minOut`. Emits `Paid` per line. Holds nothing between transactions |

Events are the record: `Paid(payer, recipient, runId, asset, stableAmount, cashAmount,
assetAmount, reasonHash)`, and `GrantOpened`, `GrantSealed`, `Vested`, `GrantRevoked`,
`GrantClosed`. The indexer copies them; the pages read the copy, and read a grant's live
state from the escrow. The router is `0x7c5bEE2a8091C3ef39072f64F18Fac913060AEaF` and its
approval proxy `0x8b773D83bc66Be128c60e07E17C8901f7a64F000`. USD₮0 is
`0x779Ded0c9e1022225f8E0630b35a9b54bE713736` (6 decimals, EIP-2612). Earlier deployments are
listed in `README.md`.

### Off chain

| Piece | Where | Job |
| --- | --- | --- |
| Route builder | `lib/okx.ts` | Asks the OKX DEX aggregator (V6) for swap calldata, server side and paced, and checks every route: the right router, no value, the right tokens and amount. Price impact over 3% is held |
| Confirmation | `lib/confirm.ts` | An event counts only if its transaction shows the USD₮0 it claims leaving the payer, and its stock is listed |
| Indexer | `lib/indexer.ts` | Walks contract events into SQLite (`var/warrant.db`) in 100-block windows with a cursor that only advances on a clean read |
| Keeper | `scripts/keeper.ts` | The release service: calls `vest` on every grant with something due, after a simulation, from a key holding only gas money |
| Readers | `lib/company.ts`, `lib/person.ts`, `lib/grants.ts` | A company's record, the public record (`readRecord`), a wallet's grants (`grantsFor`, `grantsBy`), what a wallet was paid (`readPaidTo`), a grant read live (`readGrant`) |
| Certificate data | `lib/certificate-data.ts` | One mapping from a grant to what its certificate prints, converting shares to units exactly as the escrow does |
| App | `app/` | Next.js 15, App Router, server components by default; wallet code loads only where a wallet is used |

### Stack

Next.js 15, TypeScript strict, **viem** (not ethers), wagmi with OKX Connect,
better-sqlite3, Vitest, Foundry.

## 5. Surfaces

| Route | What is on it |
| --- | --- |
| `/` | Company first: "Give your team stock that vests", the newest real grant as its certificate (an unissued outline before one exists), the three rules, grants and payroll, what your people see, built on X Layer, the public record, the fifteen stocks each with its disclosure, and the close |
| `/grants` | Issue a grant: person, stock, value, schedule, seal or keep revocable, with a live specimen certificate and a live OKX DEX quote |
| `/g/[id]` | A grant's certificate: public, server-rendered, no wallet needed, ticking as it vests, with its facts and every transaction. Seal, cancel, claim and release by role. `/grant/[id]` redirects here |
| `/me` | Your grants and pay: the connected wallet's grants as certificates, its payslips, and "Choose how you're paid next time" |
| `/run` | Payroll: a file of people and amounts, one signature, a payslip per line |
| `/pay` | Pay one person |
| `/record` | The public record: every grant and every payroll run, newest first, from chain events |
| `/receipt/[tx]` | The document for any transaction: a payslip per payment line, or a grant's moment |
| `/run/[id]` | One payroll run and all of its payslips |
| `/@[address]` | A company's grants and payroll, or a person's page, which anyone can pay through |

## 6. Design

Security printing: a vault and a stock certificate, made modern. Vault green for the
network (hero, nav, footer), bond paper for certificates and payslips, canvas for the app.
One deep shadow, on certificates only. Bodoni Moda for headlines and everything on a
certificate, Hanken Grotesk for the interface, JetBrains Mono for addresses, hashes and live
counters. **The certificate** is the one object; **the payslip** is its payroll sibling; if
something is neither, it is a ruled row or a paragraph.

Words: certificate, grant, seal, vest, release, claim, payslip, your people. Plain verbs,
sentence case, and buttons that say exactly what happens. The full contract is
`.claude/skills/warrant-ui/SKILL.md`; every value is a token in `styles/tokens.css`, and no
colour is written anywhere else.

## 7. What still depends on the founder

The code needs nothing from anyone to run; the proofs do. `docs/proofs.md` is the runbook.

1. **Real grants on mainnet**, issued, sealed, released, claimed and cancelled, including at
   least one from a team that is not the founder (`docs/outreach.md`).
2. **The keeper, running** on a small separate machine with a low-balance key.
3. **OKX Wallet by QR, confirmed on a phone:** connect, sign a choice, claim.
4. **A funded wallet** for the proofs: USD₮0 and a little OKB on X Layer.

## 8. Commands

```bash
npm run dev
npm run build
npm run typecheck
npm run test           # Vitest
cd contracts && forge test
npm run preflight      # what a deploy costs and what is missing, read from the chain
npm run index          # the indexer (--watch to keep up)
npm run keeper         # release what is due (dry unless --send)
npm run prove-fork     # fork proofs, against anvil --fork-url https://rpc.xlayer.tech
npm run prove-run
npm run prove-grant
```
