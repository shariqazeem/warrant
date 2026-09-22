# Which xStocks on X Layer can actually be paid in

> Re-measured 22 September 2026 by `npm run probe`, against the OKX DEX aggregator V6 on
> chain 196. The 19 September figures are in `var/`; the shape held and the market moved,
> which is the point of re-running it. Every figure below came from a real quote; the quotes themselves are in
> `var/probe-*.json`. Re-run it before submission — this is a market, and it moves.

`docs/brief.md` left this open: *"Which of the 43 have live on-chain liquidity, and how
deep. This is the first thing to establish."* This is the answer.

---

## What "depth" means here, and what it does not

**Depth is the largest single payment the aggregator would still route with the price
moving no more than 1%.** It is measured by asking for real quotes at $1, $10, $100,
$1,000, $10,000 and $100,000 and reading where it stops.

It is **not** pool TVL, **not** market cap, and **not** a claim about any other day.

Two ways a ladder can stop, and they are not the same answer:

| Stops because | Reported as |
| --- | --- |
| The aggregator says `Insufficient liquidity` (code 82000) | a **measurement** |
| The rate limit refused (code 50011), or the ladder ran out of rungs | a **floor**: "at least $X" |

The first version of this probe reported the second as if it were the first, for every
asset on the chain at once. Both cases are now labelled.

## The numbers

Of **662** tokens the aggregator will quote on X Layer, **640** are xStocks. Of those,
**46 have any route at all at one dollar**. The other 594 are listed and unroutable.

| Depth at ≤1% impact | 19 Sep | 22 Sep |
| --- | ---: | ---: |
| $10,000 | 5 | **26** |
| $1,000 | 31 | 10 |
| $100 | 3 | 4 |
| $10 | 3 | 0 |
| no usable route | 4 | 11 |

Between the two runs the number of assets carrying $10,000 went from five to
twenty-six, and the number routing at a dollar at all went from 46 to 51. Depth is a
market on a day; this is why the page says to re-measure rather than quoting a number
from memory.

### The three deepest

Each was refused at $100,000 with `Insufficient liquidity`, so $10,000 is a measurement
and not a ceiling this run imposed.

| | Address | Price/unit | $10,000 impact |
| --- | --- | --- | --- |
| **AAPLx**, Apple | `0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a` | $339.72 | 0.69% |
| **NVDAx**, NVIDIA | `0xc845b2894dbddd03858fd2d643b4ef725fe0849d` | $226.68 | — |
| **QQQx**, Nasdaq | `0xa753a7395cae905cd615da0b82a53e0560f250af` | $740.69 | — |

Twenty-six assets reach $10,000 on this run, so "the three deepest" is now a tie broken
alphabetically rather than a meaningful ranking. **All three of the assets Warrant offers —
SPYx at $773.35, NVDAx at $226.68, QQQx at $740.69 — still carry $10,000 at or under 1%
impact**, which is the only question that matters for the default.

## Two things worth knowing before choosing an asset

**The aggregator's token list is not the set of pairs it will route.** `wNVDAx`
(`0xa8ddb5cd96b5222afe198316e9a57caa642850d5`), the asset this repo is configured to pay
in, does **not** appear in `all-tokens` — and quotes, routes and settles perfectly well.
It reaches $10,000 at 1% impact, at $222.58 a unit. The probe therefore always ladders the
configured asset, listed or not.

**There is a wrapped and an unwrapped NVIDIA on this chain**, at different addresses and
different prices:

- `NVDAx` `0xc845b2…0849d` at $222.21 — listed
- `wNVDAx` `0xa8ddb5…50d5` at $222.58 — not listed, but routable, and the one already
  proved end to end through `Payroll`

Do not assume a symbol identifies an asset here. The address does.

## The asset this pays in, and why

**SPYx is the default. NVDAx is the alternate shown second. QQQx is the env-flip fallback.**
All three are in `lib/assets.ts`, which is the only list of them.

Liquidity did not decide this and neither did gas. A run of eight people at $3 each is $24,
which every one of the 46 routable assets carries without moving the price, and the 55,000
gas between the routes is a rounding error on a chain at roughly $0.0005 a transaction. The
only input that decides anything is what someone checking the work sees.

- **Not wNVDAx**, which is what this repo defaulted to until 19 September. It is not in
  OKX's `all-tokens`. In a hackathon judged by OKX, paying in an asset OKX's own tooling
  cannot find is a self-inflicted wound — and the failure is worse than "not found": a
  reader pastes the symbol, finds the listed NVDAx at $222.21, compares it to a receipt
  showing $222.58, and believes they have caught a pricing error. That is the Q&A spent on
  wrapped-versus-unwrapped addresses instead of on the product.
- **Not NVDAx as the default.** Technically fine, but paying someone in a single stock
  invites a question about concentration and suitability rather than about the rail.
  "We paid eight people in the S&P 500" needs no defence.
- **SPYx over QQQx**, despite QQQx's slightly better route (0.63% against 0.78% at
  $10,000), because at $24 that difference does not exist and "the Nasdaq" is
  tech-concentrated, which reintroduces the same question in a milder form.

### The three checks run before committing to it

| | |
| --- | --- |
| SPYx is in the aggregator's `all-tokens` | **yes** — as are NVDAx and QQQx |
| SPYx settles end to end through `Payroll` | **yes** — $24 → 0.031458432483190153 SPYx, above the floor, contract kept nothing |
| SPYx's hop count and whether it wraps | **4 hops**, `OkieSwap V3 → Uniswap V4 → Uniswap V3 → xStocks wrap V2` — the same shape as NVDAx |

QQQx was proved the same way so the fallback is real: $24 → 0.033223006650472585 QQQx,
679,508 gas. Only wNVDAx has a 3-hop route, because it is the underlying pool the others
wrap out of.

## What this means for the demo

A run of eight people at $3 each is $24. The constraint is not liquidity; it is having
eight real recipients.

**Re-run `npm run probe` on the morning of 25 September and again on the morning of the
demo.** Every number on this page is a market on a day.
