# Going live on X Layer mainnet

> Every figure here was read from the chain on 21 September 2026. Re-run
> `npm run preflight` before each step; it refuses to say READY while anything is missing.

---

## What it costs

Gas on X Layer is close to free. The real money is the USDT you actually pay people.

| | gas | OKB |
| --- | ---: | ---: |
| Deploy `Payroll` | 1,271,640 | 0.0000254 |
| Deploy `GrantEscrow` | 1,687,344 | 0.0000338 |
| A run of 20 people, one transaction | 10,233,060 | 0.000205 |
| Open a grant | ~700,000 | 0.000014 |
| One vest | ~120,000 | 0.0000024 |
| **All of the above** | 16,492,044 | **0.00033** |

**0.02 OKB is sixty times the whole build.** Send more only because withdrawal minimums
make it awkward not to.

USDT is the part that matters:

| | |
| --- | --- |
| 20 bounties at $3 | $60 |
| 2 grants at $20 | $40 |
| A few test payments at $1 | $5 |
| **Comfortable total** | **$105–150** |

## The wallet

**Create it yourself. Do not ask anyone — including me — to generate it for you.** A key
that has passed through someone else's machine is not yours, and this one will hold real
money on a public chain.

1. OKX Wallet → add a **new** account. Not your main one; this wallet only ever holds what
   the demo spends.
2. Copy its **address**. That is the public one, safe to share, and the one you fund.
3. Reveal its **private key** and paste it into `.env.local` as `PAYER_PRIVATE_KEY`.
   That file is in `.gitignore` and must stay there.
4. Optionally make a second account the same way for `KEEPER_PRIVATE_KEY`. It only needs
   OKB, never USDT. Grants vest without it; it just means nobody has to remember.

## Funding it

Both tokens must be on **X Layer**, not Ethereum and not another chain. Withdrawing from
the OKX exchange is the short path because X Layer is theirs:

- Withdraw **OKB**, network **X Layer**, to that address. 0.05 OKB is ample.
- Withdraw **USDT**, network **X Layer**, to the same address. $105–150.

Then check the chain agrees:

```bash
npm run preflight
```

It prints the wallet's OKB and USDT and will not say READY until both are there.

## The bring-up, in order

Each step is safe to stop after. Nothing below is irreversible except where it says so.

```bash
npm run preflight              # must say READY
npm run probe                  # re-measure depth; the market moves
npm run router-addresses       # the router and spender, from the aggregator
```

Put `OKX_ROUTER` and `OKX_ROUTER_SPENDER` in `.env.local`, then:

```bash
npm run deploy                 # deploys both contracts. IRREVERSIBLE
```

Copy the two addresses it prints into `.env.local`, then:

```bash
npm run preflight              # confirms both have code on chain
npm run prove-route -- --usd=1 --send    # one real payment from an EOA. SPENDS MONEY
npm run index                  # walk the logs into the cache
npm run dev                    # the app, against mainnet
```

Open `/receipt/<hash>` from that first payment. If a stranger can read it on a phone with
no session, the rail works.

## Before the first run of real people

- `npm run probe` again on the morning of the 25th, and again on demo day.
- `npm run check-issuer` again — the xStocks are upgradeable, and the disclosure has to
  still be true.
- Pay yourself first, at $1, and open the receipt. Then pay somebody else at $1.
- Only then a run of twenty.

## If something goes wrong

The contracts refuse rather than improvise. A payment that reverts has moved no money:
the floor was not met, or the route went stale. Ask for a fresh quote and sign again.

`Payroll` and `GrantEscrow` hold nothing between transactions. There is no admin key, no
pause, and no upgrade path — which also means there is nothing to recover with. That is the
trade, and it is the right way round for a rail that other people's money passes through.
