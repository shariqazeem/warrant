# Warrant

![tests](https://github.com/shariqazeem/warrant/actions/workflows/tests.yml/badge.svg)

**Give your team stock that vests.**

![Warrant's front page: a real grant's certificate, sealed and vesting on X Layer](docs/screenshots/front.png)

A company grants one of its people a tokenized stock (the S&P 500, NVIDIA or thirteen more).
The grant buys the stock on day one through OKX DEX and holds it in an escrow nobody can
spend, and it vests to them every second. What vests is theirs for good; seal the grant and
so is the rest. Every grant is a numbered certificate anyone can open without a wallet. And
when the company runs payroll, one signature pays the whole team, each person in the split
they chose.

**Why.** Teams of 5 to 50 people that pay in USDT across borders (crypto startups, agencies,
DAOs) cannot give equity to people in six countries, so their best people leave for a raise.
Public companies keep people with stock that vests. Warrant gives that to everyone else.

Built during **OKX Dev Day 2026** on **X Layer mainnet**, with **xStocks** as the asset, the
**OKX DEX aggregator** as the route, **USD₮0** as the money and **OKX Wallet** (by QR,
through OKX Connect) as the wallet. Track: X Layer, tokenized stocks and RWA.

- **Demo video (4 minutes):** https://youtu.be/zoJZ9jAXkAk
- **Live on X Layer mainnet:** https://warrant.world
- **A certificate vesting right now:** [No. 000003](https://warrant.world/g/3), no wallet needed
- **Every grant and payroll run:** [the public record](https://warrant.world/record)
- **The code, with its full history:** https://github.com/shariqazeem/warrant

---

## A 60-second path for judges

1. **Open a live certificate with no wallet:**
   [certificate No. 000003](https://warrant.world/g/3), $2 of Apple stock, sealed, vesting
   every second until 9 October. Every grant is on
   [warrant.world/record](https://warrant.world/record), newest first, from the events the
   escrow wrote on X Layer.
2. **Watch it vest.** "Vested now" moves every second. It is the escrow's own arithmetic,
   interpolated between exact values.
3. **Click its transaction.** "Recorded on X Layer in 0x…" opens the grant's opening on
   OKLink: the USD₮0 that left the company, the OKX DEX route, the stock arriving in escrow.
4. **See that the escrow has no owner.** Open
   [GrantEscrow's source on OKLink](https://www.oklink.com/x-layer/address/0xB238D76499616377abD4908E46F29C7CE50908D1/contract),
   verified there as an exact match of [`contracts/src/GrantEscrow.sol`](contracts/src/GrantEscrow.sol):
   no owner, no admin role, no pause, no setter, no upgrade path.
5. **Open the proof table.** [Below](#proof-table): every claim on this page, linked to the
   transaction that makes it true.

## What it does

**Grants are the product.** A company picks a person, a stock and an amount, and a schedule.

- **Bought on day one.** The grant buys the stock the moment it is issued, through OKX DEX,
  at no less than a minimum the contract enforces. It is not a promise to buy later.
- **Vests every second.** Linear from the start date, with a cliff if you want one. Anyone
  can release what is due and earn the grant's release fee, so it arrives even if nobody
  remembers.
- **What vests is theirs.** The company can cancel only the unvested part, and only until
  it seals the grant. Once sealed, nobody can take any of it back, including the company.

**Payroll comes second.** Upload who you pay and how much, and sign once. Everyone is paid
in that one transaction, each in the split they chose (part stock and part USD₮0, or all of
either), and every line gets a payslip anyone can open.

**The person chooses the stock**, once, at `/me`, with an EIP-712 signature that is free and
sends nothing. Payroll follows it. Their grants, payslips and choice live on one page.

<p align="center">
  <img src="docs/screenshots/certificate.png" width="66%" alt="Certificate No. 000003: 0.0059 AAPLx, bought for $2.00 through OKX DEX, its route, the schedule, and the oxblood seal">
  <img src="docs/screenshots/certificate-phone.png" width="25%" alt="The same certificate on a phone, with no wallet: vested so far, ticking every second">
</p>

Every grant is a certificate with its own number and its own engraving, drawn from the
chain: the units, what they were bought for and at what price, the route OKX DEX took, the
schedule, the seal, and the transaction it was recorded in. It opens on a phone from a link,
with no wallet and no account, and the vested figure moves every second.

| Issuing a grant | A payslip |
| --- | --- |
| ![The grant form: person, stock, value, schedule, seal or keep revocable, with a live specimen certificate](docs/screenshots/issue.png) | ![A real payslip from a payroll run: $2 paid, $1 of it bought NVDAx, $1 kept as USD₮0, the price and the note](docs/screenshots/payslips.png) |

## Built on X Layer and OKX

- **X Layer mainnet (196).** Both contracts live there, and every grant, seal, cancel,
  release and payslip is an X Layer transaction, paid for in OKB at a fraction of a cent. Every
  figure on a certificate links to its transaction on OKLink.
- **OKX DEX aggregator (V6).** Every grant and every payroll line buys its stock through a
  live aggregator route, requested server side and checked before anyone signs: the router
  the contracts were deployed with, no value attached, the right tokens and amount. The
  contract enforces the quote's minimum, and the route itself is printed on the certificate
  (for No. 000003: USD₮0 → USDG → wAAPLx → AAPLx).
- **xStocks.** Fifteen tokenized stocks, each checked on chain for its issuer and for real
  liquidity, with what the issuer can do stated beside every one.
- **OKX Wallet**, in the browser or by QR through OKX Connect: connect, sign a choice
  (EIP-712, free), issue, seal, claim, and "Show AAPLx in OKX Wallet" (`wallet_watchAsset`).
- **USD₮0 with EIP-2612.** Approval is a signature, so a grant is one signature and one
  transaction, and a whole payroll run is too.
- **OKLink.** Both contracts are verified there as exact matches of this repository.

## Live links and contracts

| | |
| --- | --- |
| The app | https://warrant.world |
| The public record | https://warrant.world/record |
| Issue a grant | https://warrant.world/grants |
| Your grants and pay | https://warrant.world/me |
| Payroll | https://warrant.world/run |
| `GrantEscrow` | [`0xB238D76499616377abD4908E46F29C7CE50908D1`](https://www.oklink.com/x-layer/address/0xB238D76499616377abD4908E46F29C7CE50908D1), deployed in block 71,416,683 ([tx](https://www.oklink.com/x-layer/tx/0xaefe42748f057cde7a7c7df2850b94ea6ebfef82f888bf5092c9c886e7284d21)). No owner, no admin, no upgrade path |
| `Payroll` (v2) | [`0xD9d06266B9290bA5ee81Cc54657844D4a874431d`](https://www.oklink.com/x-layer/address/0xD9d06266B9290bA5ee81Cc54657844D4a874431d), deployed in block 71,420,033 ([tx](https://www.oklink.com/x-layer/tx/0x9ee05c1e18ddc4108b1d959473dc08154e769b554d7d2df391dfddba05b02824)). No owner, no admin, no upgrade path |
| Money | USD₮0 on X Layer, `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` (6 decimals, EIP-2612 permit, domain "USD₮0" version 1) |
| Route | The OKX DEX router `0x7c5bEE2a8091C3ef39072f64F18Fac913060AEaF`, approval proxy `0x8b773D83bc66Be128c60e07E17C8901f7a64F000` |
| Stocks | 15 xStocks, each checked on chain for the same issuer and for real liquidity on 23 September: the S&P 500, Nasdaq 100 and Russell 2000, and Alphabet, Amazon, Apple, Broadcom, Circle, Coinbase, Meta, Microsoft, MicroStrategy, NVIDIA, Robinhood and Tesla ([`lib/assets.ts`](lib/assets.ts), [`docs/liquidity.md`](docs/liquidity.md)) |
| Chain | X Layer mainnet, chain id 196. Fees in OKB |

Checked against the chain on 24 September in [`docs/state-check.md`](docs/state-check.md):
both contracts have code at these addresses, their `stable()`, `router()` and
`routerSpender()` match the table, and their runtime bytecode matches this source. On 25
September both were **verified on OKLink** from this source, as exact matches:
[GrantEscrow](https://www.oklink.com/x-layer/address/0xB238D76499616377abD4908E46F29C7CE50908D1/contract)
and [Payroll](https://www.oklink.com/x-layer/address/0xD9d06266B9290bA5ee81Cc54657844D4a874431d/contract).
The compiler input for each is in [`contracts/verify/`](contracts/verify/), so anyone can
repeat it.

**Earlier deployments.** Payroll v1 `0xBf9C…AE09` (23 September) carried one stock per run;
it made the first real payment, whose payslip still opens, and is otherwise retired. The
first deployment of 22 September (Payroll `0xbe70…b5cD`, GrantEscrow `0x5A5A…71DC`) used the
older bridged USDT, which OKX Wallet's swap does not hand out; it never paid anyone, and the
same code was redeployed on USD₮0 the next day.

## Proof table

Every claim, with the transaction that makes it true. Wallets the founder controls are
labelled as the founder's. Nothing is staged, and a row says "pending" until its transaction exists.
The runbook for each row is [`docs/proofs.md`](docs/proofs.md).

| Claim | Transaction | Block | Time (UTC) |
| --- | --- | --- | --- |
| First real payment: $2 paid, 0.0026 SPYx received (Payroll v1) | [`0x9efd0b66…809f64`](https://www.oklink.com/x-layer/tx/0x9efd0b668e6f2c7ff88100163697278b73f53d7f735120d7008720b122809f64) | 71,418,717 | 23 Sep 18:22 |
| Grant A, [certificate No. 000002](https://warrant.world/g/2): $3 of SPYx from the founder's company wallet to the founder's second wallet, 10 minutes, no cliff | [`0x1e534b82…032da2`](https://www.oklink.com/x-layer/tx/0x1e534b8221a8009bac392cfae4c340bed9565f2000f0f091577bd10c86032da2) | 71,575,157 | 25 Sep 13:49 |
| Grant A sealed (after it had fully vested) | [`0x26e46413…c3ce84`](https://www.oklink.com/x-layer/tx/0x26e4641334dec16f3f0357461a7c279a77ed080ebca7237a2ebfd81b55c3ce84) | 71,576,220 | 25 Sep 14:07 |
| Grant A released by the keeper, nobody pressing anything: the first of six releases, two minutes apart | [`0xd66665ef…e62378`](https://www.oklink.com/x-layer/tx/0xd66665efd6842cfe5fc1a49f1a13ea8e09da3b8106e3a0df5478643ecce62378) | 71,575,176 | 25 Sep 13:50 |
| Grant A's last release: all 0.0039 SPYx in the recipient's wallet | [`0xf6ec7df6…93c5fe`](https://www.oklink.com/x-layer/tx/0xf6ec7df6128c9680b8accfd6e09f8a61b1c124d592651df00d98eafeaa93c5fe) | 71,575,797 | 25 Sep 14:00 |
| Grant A claimed by the recipient | pending | | |
| Grant B, [certificate No. 000001](https://warrant.world/g/1): $2 of SPYx to the founder's second wallet, 30 minutes, 2-minute cliff, revocable | [`0x2984e221…231f5d`](https://www.oklink.com/x-layer/tx/0x2984e2213a4e99bf30f8195c9cdcf9913e8254ff591754038c434259c9231f5d) | 71,573,076 | 25 Sep 13:15 |
| Grant B cancelled after the cliff: 0.0024 SPYx back to the company at once, the 0.00018 that had vested stayed theirs | [`0x044290a6…58d828`](https://www.oklink.com/x-layer/tx/0x044290a6c6d638045791fbd23ae2280da5fc7b7b683927c65eac141dd858d828) | 71,573,202 | 25 Sep 13:17 |
| Grant B: what had vested, released to them by the keeper 44 seconds later | [`0x839d5d69…4b2b8e`](https://www.oklink.com/x-layer/tx/0x839d5d696a4a8c3608e6d555158d0bea7ac0d99d5bcdc3bf5fb96cb9a14b2b8e) | 71,573,246 | 25 Sep 13:18 |
| The live grant, [certificate No. 000003](https://warrant.world/g/3): $2 of AAPLx to the founder's second wallet, 14 days, no cliff, still vesting through judging | [`0x98e181b9…42e766`](https://www.oklink.com/x-layer/tx/0x98e181b9f031d48ee0196c9f2f4f1afcd805e1914b4b7e817071221c0c42e766) | 71,578,495 | 25 Sep 14:45 |
| Certificate No. 000003 sealed, while it vests | [`0x8076b16d…a5e9cf`](https://www.oklink.com/x-layer/tx/0x8076b16d2aafee41f144c5fae8f7e03200042e3152cca36d65a5c42f58a5e9cf) | 71,579,602 | 25 Sep 15:03 |
| Grant C issued by a real team to one of its people | pending | | |
| Payroll run: three of the founder's wallets, three different signed choices (100% SPYx, 50% NVDAx, all dollars), one signature, [three payslips](https://warrant.world/receipt/0xbe8dd2e473743166420fc54ce48c484c2a3dcc75aa722f4068001a412b9b3e4f) | [`0xbe8dd2e4…9b3e4f`](https://www.oklink.com/x-layer/tx/0xbe8dd2e473743166420fc54ce48c484c2a3dcc75aa722f4068001a412b9b3e4f) | 71,577,946 | 25 Sep 14:36 |
| Signed choices | 3, all the founder's own wallets; none yet from other people | | |

## How the vesting maths is verified

The schedule lives in two languages, so it is held to one fixture by both.

- **The contract.** `GrantEscrow._vestedShares`: nothing before `start + cliff`; everything
  from `start + duration`; in between `floor(shares × (now − start) / duration)`. A revoked
  grant is frozen at what had vested. Shares convert to units as
  `floor(shares × (balance + 1) / (poolShares + 1e6))`, always rounding down.
- **The page.** [`lib/schedule.ts`](lib/schedule.ts) mirrors the formula in bigint.
  [`contracts/test/fixtures/schedule.json`](contracts/test/fixtures/schedule.json) is read
  by the Solidity test (`Schedule.t.sol`) and by the TypeScript test
  (`lib/schedule.test.ts`), so the two cannot drift. The certificate converts shares to
  units with the escrow's own offset, read out of the contract source by
  `lib/certificate-data.test.ts`.
- **On a fork of mainnet.** `npm run prove-grant` opens a $100 SPYx grant through the real
  OKX route on an Anvil fork and moves the clock: nothing is due before the cliff, a
  keeper's fee is exactly the grant's release fee, the beneficiary pays none, and at the end
  the escrow is empty to within a few wei.
- **The certificate against the escrow itself.** `scripts/prove-vesting-fork.ts` opens a grant
  on the deployed escrow on an Anvil fork and compares the certificate's arithmetic
  ([`lib/vesting.ts`](lib/vesting.ts)) with the escrow's own view functions at every moment
  that matters: before the start, around the cliff, midway, at and after the end, after a
  release, and after a cancel, including what a cancel returns, predicted before it is sent.
  53 of 53 figures agree.

  ```bash
  anvil --fork-url https://rpc.xlayer.tech --port 8547 --silent &
  FORK_URL=http://127.0.0.1:8547 npx tsx scripts/prove-vesting-fork.ts
  ```

**Tests.** 69 Foundry tests and 545 Vitest tests, all passing, run by CI on every push
([tests](https://github.com/shariqazeem/warrant/actions/workflows/tests.yml)).

```bash
npm run test                    # Vitest
cd contracts && forge test      # Foundry
npm run typecheck
```

Proofs that cost nothing, against a fork of mainnet with the real router and real tokens:

```bash
anvil --fork-url https://rpc.xlayer.tech --silent &
npm run prove-fork     # one payment through Payroll with a real OKX route
npm run prove-run      # five people, five different splits, one signature, one transaction
npm run prove-grant    # a grant opens, vests on schedule, pays the release fee and empties
```

**The pages themselves, in a real browser.** [`scripts/fork-e2e.mjs`](scripts/fork-e2e.mjs)
runs the site against the same fork with a test wallet that announces itself the way OKX
Wallet does and signs with fork-only keys, so every page runs as it does for a person: it
issues a grant from `/grants` (one permit signature, one transaction, on the certificate as
it engraves in), seals it, has the recipient claim, cancels another, and pays three people
from `/run` in one signature. Its header has the setup.

## Architecture

```
  company's wallet ──USD₮0──▶ GrantEscrow ──OKX DEX route──▶ xStock, held in shares of a pool
                                   │
             anyone calls vest() ──┴──▶ what is due, to the person's own wallet
                                        (the caller earns the grant's release fee)

  company's wallet ──USD₮0──▶ Payroll ──per line: OKX DEX route──▶ stock and USD₮0,
                                                                   straight to each person
```

| Piece | What it does |
| --- | --- |
| [`contracts/src/GrantEscrow.sol`](contracts/src/GrantEscrow.sol) | `open` / `openWithPermit` buys the stock once, through the OKX router, bounded by a minimum the contract enforces, and holds it as shares of a per-stock pool, so an issuer's mint or burn moves every grant in proportion. `vest` is permissionless and pays the caller `tipBps` of the release (0 to 2%, set per grant), and nothing when the person calls it themselves. `seal` gives up the right to cancel, for good. `revoke` returns the unvested stock to the company; what had vested stays claimable. `close` marks a finished grant |
| [`contracts/src/Payroll.sol`](contracts/src/Payroll.sol) | `payOne(Line, runId)` and `payMany(Line[], runId)`, with permit variants. Pulls the USD₮0 once; each line names its own stock (or none), is swapped through the OKX router with the person as the receiver, and is measured in their own balance. Any line below its minimum reverts the whole run. It holds nothing between transactions |
| [`lib/okx.ts`](lib/okx.ts) | The OKX DEX aggregator client (V6), server side and paced. Every route is checked: the router the contracts were deployed with, no value, the right tokens and amount |
| [`lib/confirm.ts`](lib/confirm.ts) | An event is only as honest as the call that made it. Nothing is shown as a payment or a grant unless its stock is listed and the USD₮0 it claims really left the payer, read from the transaction's own transfers |
| [`lib/indexer.ts`](lib/indexer.ts) | Walks the contracts' events into SQLite, 100 blocks at a time (the public RPC's cap), waiting out rate limits. The cursor only advances on a window that read cleanly |
| [`scripts/keeper.ts`](scripts/keeper.ts) | The release service: calls `vest` on grants with something due, after a simulation, from a key that holds only gas money. Each grant is released about 48 times over its schedule (every 2 minutes on a 10-minute grant, daily on a long one) and once more when it ends, so a dollar of OKB pays for over a thousand releases ([`lib/keeper-cadence.ts`](lib/keeper-cadence.ts)) |
| `app/` | `/`, `/grants`, `/g/[id]`, `/me`, `/run`, `/pay`, `/record`, `/receipt/[tx]`, `/run/[id]`, `/@[address]`, with share cards. Server-rendered; wallet code loads only where a wallet is used |

Stack: Next.js 15 (App Router), TypeScript strict, viem, wagmi with OKX Connect, SQLite
(better-sqlite3), Vitest, Foundry.

## Security

- **No admin anywhere.** Neither contract has an owner, an admin role, a pause, an
  allowlist, a setter, a sweep, a rescue function or an upgrade path. Neither can receive
  OKB. Once deployed, nobody can change what they do, including us.
- **The company cannot spend the escrow.** Only `vest` moves a grant's stock to its person,
  and only `revoke`, before a seal, returns the unvested part to the company.
- **Exact approvals.** The app approves exactly the amount a payment or grant needs, or signs
  a permit for exactly that, never an unlimited allowance.
- **Minimums on chain.** Every swap has a minimum out, taken from the live OKX quote and
  enforced by the contract; below it the transaction reverts and no USD₮0 moves.
- **An adversarial pass** over both contracts on 19 September closed two vulnerabilities
  before deployment (commit `e1dbb72`), and grants hold shares rather than units so a
  donated or burned token cannot move value between grants.
- **The issuer's powers, said plainly.** Every xStock here sits behind one upgradeable
  contract with one owner, `0x49754062E35f7591B93cc4F9915965be89643a65`, which can destroy
  units held by any address (the escrow's included), create new units, replace the code and
  hand those powers on. Warrant cannot prevent any of it, and says so on every stock's row.
  An xStock is a stock position with economic exposure to the price; it carries no voting
  rights. xStocks are not available to US persons, or in Canada, the UK or Australia.

## Limits, stated honestly

- **Eligibility is a statement, not a check.** A person states they are not a US person and
  do not live in Canada, the UK or Australia when they choose stock; there is no KYC.
- **No on-ramp or off-ramp.** A company needs USD₮0 and a little OKB on X Layer. A person
  realises value by holding, moving or selling the stock elsewhere; Warrant has no sell flow.
- **Fifteen stocks.** SPYx, NVDAx and AAPLx have settled on mainnet (grants and a payroll
  run), and QQQx on a fork; the other eleven are quoted by the aggregator and have not been
  bought yet. Liquidity was measured on 22 and 23 September, and markets move.
- **The public RPC.** X Layer's public endpoint answers log queries over at most 100 blocks
  and a few reads a second; the indexer and every page are built around that.
- **One server.** The app, the indexer and the release service run on one machine with
  SQLite. The record is a cache of the chain: delete it and it is rebuilt from the events.
- **Releases need a caller.** The keeper releases what is due; if it stops, anyone can still
  release from a certificate, and the page says so instead of promising releases.
- **English only.**

## The business

Warrant charges nothing to issue a grant or run payroll, and its contracts take no cut. It
earns in two ways:

1. **Running the release service.** Every grant carries a release fee, paid by the grant
   itself to whoever releases what is due. Warrant runs the keeper that does it, so the
   stock arrives on schedule even if nobody remembers.
2. **A company tier.** Exports for the accountant (cost, units, schedule, releases,
   transactions), team lists and reminders, for teams of 5 to 50 who pay across borders in
   USDT and cannot give equity to people in six countries.

## Lineage

Warrant was built on X Layer during Dev Day. At the start I ported the design system and
parts of the engine from Scrip, my Solana app for individuals ([`docs/reuse.md`](docs/reuse.md)
lists what, with the commits). Since then the design has been replaced and the product
serves companies. Scrip is the person's side, on Solana; Warrant is the company's side, on X
Layer. The commit history in this repository is all inside the build window.

## Commands

```bash
npm run dev            # the app
npm run build          # production build
npm run typecheck
npm run test           # Vitest
npm run preflight      # ready to spend real money? reads the chain, gates on the answer
npm run probe          # which xStocks have real liquidity, and how deep
npm run check-issuer   # what the issuer of each stock can do, read from the chain
npm run check-permit   # USD₮0's permit domain, read from the chain
npm run verify-deploy  # the deployed contracts' stable, router and spender match .env
npm run index          # walk the events into the record (--watch to keep up)
npm run keeper         # release what is due on every grant (dry unless --send)

cd contracts && forge test
```

After changing a contract: `cd contracts && forge build && npx tsx scripts/sync-abi.ts`.

## Start here

1. [`CLAUDE.md`](CLAUDE.md): the product, the architecture and the standing policies
2. [`docs/state-check.md`](docs/state-check.md): the claims, checked against the code and the chain
3. [`docs/proofs.md`](docs/proofs.md): the mainnet proofs, step by step
4. [`docs/liquidity.md`](docs/liquidity.md): which xStocks can be granted, measured
5. [`docs/reuse.md`](docs/reuse.md): what came from Scrip, and what replaced it
