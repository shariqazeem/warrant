# Which xStocks on X Layer can actually be paid in

> Measured 19 September 2026 by `npm run probe`, against the OKX DEX aggregator V6 on
> chain 196. Every figure below came from a real quote; the quotes themselves are in
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

| Depth at ≤1% impact | Assets |
| --- | --- |
| $10,000 | **5** — NVDAx, QQQx, SPCXx, SPYx, TSLAx |
| $1,000 | 31 |
| $100 | 3 |
| $10 | 3 |
| no usable route | 4 |

### The three deepest

Each was refused at $100,000 with `Insufficient liquidity`, so $10,000 is a measurement
and not a ceiling this run imposed.

| | Address | Price/unit | $10,000 impact |
| --- | --- | --- | --- |
| **NVDAx**, NVIDIA | `0xc845b2894dbddd03858fd2d643b4ef725fe0849d` | $222.21 | 0.68% |
| **QQQx**, Nasdaq | `0xa753a7395cae905cd615da0b82a53e0560f250af` | $722.33 | 0.63% |
| **SPCXx**, SpaceX | `0x68fa48b1c2fe52b3d776e1953e0e782b5044ce28` | $152.85 | 0.71% |

SPYx (0.78%) and TSLAx (0.87%) also reach $10,000, with more impact.

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

## What this means for the demo

A run of eight people at $3 each is $24. Every one of the 46 routable assets carries that
without moving the price at all. The constraint is not liquidity; it is having eight real
recipients.
