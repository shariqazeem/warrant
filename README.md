# Warrant

**Get paid in stocks.**

Choose how much of every payment becomes stock, and which stock (the S&P 500, NVIDIA,
Apple and twelve more), and share your link, warrant.world/@you. Whoever pays you through
it pays in dollars and never picks your stock; you get your split in your own wallet, with
a public receipt that says why. The choice is an EIP-712 signature from your own wallet: free,
checkable by anyone. A company paying many people pays them all in one signature, each their
own way; for the people it wants to keep, a grant vests stock on a schedule out of an escrow
the company cannot spend.

Built for **OKX Dev Day 2026** on **X Layer**, with **xStocks** as the asset, the **OKX DEX
aggregator** as the route and **OKX Wallet** (by QR, through OKX Connect) as the wallet.
Primary track: X Layer, tokenized stocks and RWA.

**Live on X Layer mainnet: https://warrant.world**

---

## On mainnet

| | |
| --- | --- |
| `Payroll` | [`0xD9d06266B9290bA5ee81Cc54657844D4a874431d`](https://www.oklink.com/x-layer/address/0xD9d06266B9290bA5ee81Cc54657844D4a874431d), deployed in block 71420033 ([tx](https://www.oklink.com/x-layer/tx/0x9ee05c1e18ddc4108b1d959473dc08154e769b554d7d2df391dfddba05b02824)). Each line names its own stock |
| `GrantEscrow` | [`0xB238D76499616377abD4908E46F29C7CE50908D1`](https://www.oklink.com/x-layer/address/0xB238D76499616377abD4908E46F29C7CE50908D1), deployed in block 71416683 ([tx](https://www.oklink.com/x-layer/tx/0xaefe42748f057cde7a7c7df2850b94ea6ebfef82f888bf5092c9c886e7284d21)) |
| Stablecoin | USDT on X Layer, the USD₮0 token: `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` (6 decimals, EIP-2612 permit, domain "USD₮0" v1) |
| Route | The OKX DEX router `0x7c5bEE2a8091C3ef39072f64F18Fac913060AEaF`, approval spender `0x8b773D83bc66Be128c60e07E17C8901f7a64F000` |
| Stocks | 15 xStocks, each checked for the same issuer and real liquidity on 23 Sep: the S&P 500, Nasdaq 100 and Russell 2000, and Alphabet, Amazon, Apple, Broadcom, Circle, Coinbase, Meta, Microsoft, MicroStrategy, NVIDIA, Robinhood and Tesla (`lib/assets.ts`, `docs/liquidity.md`) |

The deployed runtime bytecode matches this source (immutables masked). The first real
payments will be listed here, each beside its transaction, as they happen.

**Earlier deployments.** Payroll `0xBf9C…AE09` (23 Sep) carried one stock per run; it made
the first real payment, whose receipt still opens, and is otherwise retired. **Why USD₮0.**
X Layer has two tokens that call themselves USDT. The first deployment (22
Sep: Payroll `0xbe70…b5cD`, GrantEscrow `0x5A5A…71DC`) used the older bridged USDT, 3.3M
on chain; OKX Wallet's swap hands out USD₮0, 106.6M. A payer who swapped to "USDT" saw $0,
so on 23 Sep the same code was redeployed on USD₮0. The first deployment never paid anyone
and is not used.

## The demo, in six beats

1. **A person gets their link.** On `/me`, in their own wallet, for free: "25% of each payment
   into the S&P 500." The choice is an EIP-712 signature anyone can verify; the link is
   `warrant.world/@them`.
2. A file of names and amounts, dropped onto `/run`. Each line shows the choice it will
   follow; a line that will not pay is shown in place with the rule it broke named.
3. **One signature.** USD₮0 on X Layer implements EIP-2612, so approval is a signature
   rather than a transaction, and the whole run, with everyone's different choices, is one
   transaction. The receipts print: one transaction, N stubs, one run id.
4. Open one on a phone: what was paid, what it became, at what price, why, and the
   transaction it is anchored to. No account needed.
5. The public page: every payment with its reason, and each person's signed choice.
6. A grant: stock bought on day one, held in escrow, released on a schedule by anyone who
   calls `vest`, with a receipt for each release.

## What is in here

| | |
| --- | --- |
| `contracts/src/Payroll.sol` | `payOne` / `payMany`, and the permit variants. Pulls the stablecoin once; each line names its own stock (or none, for someone paid all in dollars), is routed through the OKX aggregator with the person as the receiver, and is measured in its own stock; the whole run reverts if any line is below its minimum |
| `contracts/src/GrantEscrow.sol` | `open`, `seal`, `vest`, `revoke`, `close`. Buys the asset once and holds it in shares of a pool, so an issuer's mint, burn or rebase is shared fairly. `vest` is permissionless and tips whoever calls it |
| `lib/okx.ts` | The signed OKX aggregator client, V6, server only |
| `lib/confirm.ts` | An event is only as honest as the call that made it. Nothing is shown as a payment unless its asset is a listed xStock and the payer's USDT really left, read from the transaction's own transfers |
| `lib/indexer.ts` | Walks the contracts' events into SQLite, 100 blocks at a time (the public RPC's cap), waiting out rate limits. The cursor only advances on a window that read cleanly |
| `middleware.ts` | A per-visitor allowance for price requests and record pages, so one script can't spend everyone's OKX quota or RPC reads |
| `app/` | `/`, `/pay`, `/run`, `/grants`, `/receipt/[tx]`, `/@[address]`, `/run/[id]`, `/grant/[id]`, with share cards |

**Tests: 65 Foundry and 221 Vitest.** Four of the Foundry tests exist only for what an
xStock issuer can do to the escrow, and four more only for what a donated token must not be
able to do to a receipt.

## Start here

1. `CLAUDE.md`: the product, the architecture, the standing policies
2. `docs/plan.md`: what to build, in order, and the scope guards
3. `docs/liquidity.md`: which xStocks can actually be paid in, measured
4. `docs/go-live.md`: what mainnet costs and the bring-up in order
5. `docs/brief.md`: the hackathon and the chain, with what was verified

## Commands

```bash
npm run dev            # the app
npm run preflight      # am I ready to spend real money? reads the chain, gates on the answer
npm run probe          # which xStocks have real liquidity, and how deep
npm run check-issuer   # what the issuer of each asset can do, read from the chain
npm run check-permit   # whether a run can be one transaction on this chain
npm run deploy         # both contracts. IRREVERSIBLE
npm run index          # walk the logs into the cache (--watch to keep up)
npm run keeper         # release what is due on every grant (dry unless --send)

cd contracts && forge test

scripts/deploy-vm.sh   # ship to the server: build beside the live site, then swap
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

From `CLAUDE.md`. They carry weight in the code, not just in the docs:

- **Every money moment prints a receipt** anyone can open, anchored to a real transaction.
- **Never render a number the chain or a stored receipt cannot confirm.** No simulated
  balances, no projections, no sample rows.
- **Failure returns a value.** `Outcome<T>`; nothing throws for control flow.
- **Money-critical code requires tests before it ships**: the split arithmetic, the minimum
  out, the vesting schedule, the reason hash, the payment confirmation.
- **Two lists that drift is the dominant defect shape.** The reason hash, the ABI, the
  events, the vesting schedule and the grant limits each exist in two places, and each has
  a test that reads both.
- **Disclose what the issuer can do** on every asset row, read from the chain: one
  upgradeable owner can create units, destroy units and replace the code. And who may not
  hold one: xStocks are not available to US persons, or in Canada, the UK or Australia.
- Say **"a stock position"**, never "shareholder". xStocks carry no voting rights.

## This is not Scrip

Scrip is the same author's other project: the person's side, on Solana, a rule on the
wallet you get paid to. Warrant is the company's side, on X Layer, a rail for paying people
in stock. One engine, two products, two chains. The design system was ported from Scrip
(`docs/reuse.md` lists exactly what); the contracts, the chain and the product are Warrant's.
