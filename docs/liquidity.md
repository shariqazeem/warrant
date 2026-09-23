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

---

## 23 September 2026: fifteen to choose from

> Measured 23 September 2026, 18:37 to 18:41 UTC. Addresses from the aggregator's own
> `all-tokens` for chain 196 (662 tokens), never typed in. Quotes from the V6 `quote`
> endpoint, USD₮0 (`0x779Ded0c9e1022225f8E0630b35a9b54bE713736`) into the stock, at $1,
> $1,000, $10,000 and $100,000. Chain reads from `rpc.xlayer.tech` at block 71,419,772.
> Read only: nothing was signed or sent.

People now choose their own stock, so the menu grew from three to fifteen. Each one had
to clear the same bar, and every one of the fifteen below did:

1. **The same issuer as the three already offered**: EIP-1967 implementation
   `0x65c40d624af3b18c109fbf87b7deff34cdc5f19b`, `owner()`
   `0x49754062E35f7591B93cc4F9915965be89643a65`, and byte-identical proxy code. That is
   what keeps the one issuer disclosure in `lib/assets.ts` true on every row.
2. **18 decimals**, and `symbol()` on chain matching the aggregator's list.
3. **A route at both $1,000 and $10,000.**
4. **No more than 1% price impact at $1,000.**

| | Name | Address | Price/unit | $1,000 | $10,000 | Route at $1,000 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| **SPYx** | S&P 500 | `0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48` | $768.58 | 0.10% | 0.16% | USDT → USDG → wSPYx → SPYx, 4 legs |
| **QQQx** | Nasdaq 100 | `0xa753a7395cae905cd615da0b82a53e0560f250af` | $740.60 | 0.01% | 0.16% | USDT → USDG → USDC → wQQQx → QQQx, 5 legs |
| **IWMx** | Russell 2000 | `0xdadfb355c6110eda0908740d52c834d6c2bcddc7` | $282.72 | 0.12% | 0.46% | USDT → USDG → USDC → wIWMx → IWMx, 5 legs |
| **GOOGLx** | Alphabet | `0xe92f673ca36c5e2efd2de7628f815f84807e803f` | $339.73 | 0.13% | 0.25% | USDT → USDG → USDC → wGOOGLx → GOOGLx, 5 legs |
| **AMZNx** | Amazon | `0x3557ba345b01efa20a1bddc61f573bfd87195081` | $249.58 | 0.13% | 0.76% | USDT → USDG → wAMZNx → AMZNx, 4 legs |
| **AAPLx** | Apple | `0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a` | $337.32 | 0.13% | 0.43% | USDT → USDG → wAAPLx → AAPLx, 4 legs |
| **AVGOx** | Broadcom | `0x38bac69cbbd28156796e4163b2b6dcb81e336565` | $355.44 | 0.17% | 0.87% | USDT → USDG → USDC → wAVGOx → AVGOx, 5 legs |
| **CRCLx** | Circle | `0xfebded1b0986a8ee107f5ab1a1c5a813491deceb` | $92.20 | 0.27% | 0.25% | USDT → USDG → ETH → USDC → xBTC → wCRCLx → CRCLx, 9 legs |
| **COINx** | Coinbase | `0x364f210f430ec2448fc68a49203040f6124096f0` | $198.31 | 0.08% | 0.83% | USDT → USDG → ETH → USDC → wCOINx → COINx, 6 legs |
| **METAx** | Meta | `0x96702be57cd9777f835117a809c7124fe4ec989a` | $749.49 | 0.25% | 1.26% | USDT → USDG → wMETAx → METAx, 4 legs |
| **MSFTx** | Microsoft | `0x5621737f42dae558b81269fcb9e9e70c19aa6b35` | $499.89 | 0.05% | 0.22% | USDT → USDG → wMSFTx → MSFTx, 4 legs |
| **MSTRx** | MicroStrategy | `0xae2f842ef90c0d5213259ab82639d5bbf649b08e` | $162.52 | 0.20% | 0.21% | USDT → USDG → xBTC → wMSTRx → MSTRx, 6 legs |
| **NVDAx** | NVIDIA | `0xc845b2894dbddd03858fd2d643b4ef725fe0849d` | $225.34 | 0.01% | 0.21% | USDT → USDG → wNVDAx → NVDAx, 4 legs |
| **HOODx** | Robinhood | `0xe1385fdd5ffb10081cd52c56584f25efa9084015` | $124.98 | 0.15% | 0.82% | USDT → USDG → USDC → wHOODx → HOODx, 5 legs |
| **TSLAx** | Tesla | `0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0` | $379.39 | 0.09% | 0.78% | USDT → USDG → USDC → wTSLAx → TSLAx, 5 legs |

How to read it:

- **Price/unit** is $1 divided by the units the $1 quote returned, the same way the
  22 September table was built.
- **$1,000 and $10,000** are the aggregator's `priceImpactPercent` as a size. It reports a
  move against the payer as negative; one figure here came back positive (NVDAx at
  $1,000, +0.01%).
- **Legs** are counted the way the pay form shows a route, one per venue, so a split
  counts each side. The venues were JIT Router, Uniswap V4 and V3, Caliber propAMM,
  ElfomoFi and CurveNG. At $10,000 the aggregator splits wider, up to 9 legs, but through
  the same tokens. The two exceptions are CRCLx, which goes USDT → xBTC → wCRCLx, and
  MSTRx, which goes through ETH instead of USDG.
- **Every route ends the same way**: the wrapped token unwrapped by `xStocks wrap V2`
  (wSPYx → SPYx, wAAPLx → AAPLx, and so on). That is the last leg of the three already
  proved through `Payroll`.

**At $100,000** only SPYx stays within 1% (0.75%), so its `depthUsd` is now $100,000. That
is a floor, because the ladder stopped there. At that size NVDAx moved the price 1.58%,
QQQx 1.74%, GOOGLx 2.33%, CRCLx 2.46% and TSLAx 5.22%. The other nine were refused with
`Insufficient liquidity` (82000).

**METAx is the one that does not carry $10,000** within 1% today (1.26%), so its
`depthUsd` is $1,000. Warrant holds a payment or grant only when it would move the price
more than 3% (`MAX_PRICE_IMPACT_PERCENT`), so a $10,000 payment in METAx would still go
through.

### The issuer, read again for all fifteen

The four checks `npm run check-issuer` makes, paced for the public RPC: the implementation
slot, `owner()`, the proxy's code, and which selectors the implementation carries. All
fifteen answered the same implementation, the same owner and the same proxy code
(keccak `0xe7cbfea5…211b4c`). The implementation (15,981 bytes) carries `mint`, `burn` and
`transferOwnership`, and shows no sign of `pause`, `blacklist`, `addToBlockedList`,
`freeze`, `forceTransfer`, `seize`, `setMultiplier` or `rebase`. That is the same finding
as 19 September, so `ISSUER.checkedOn` moved to 23 September and `ISSUER_OWNER_NOTE` now
says "every stock Warrant pays in" instead of "all three".

### What changed in `lib/assets.ts`, and what did not

- **SPYx is still the default**, still first. After it come the broad funds (QQQx, IWMx),
  then the single stocks by name. NVDAx is no longer second. The 22 September section
  above ("NVDAx is the alternate shown second", "All three are in `lib/assets.ts`")
  describes that day.
- **Twelve of the fifteen are quoted, not settled.** `lib/assets.ts` records only SPYx,
  QQQx and NVDAx as proved end to end through `Payroll`. The other twelve say
  `provedOnFork: false`.
  They run the same code and end on the same last leg as the three that were proved,
  which is why they are expected to settle, but that is an expectation and not a proof.
  `npm run prove-fork -- --asset=<address>`, against an anvil fork, proves one.
- **Why fifteen and not fewer.** Every candidate that cleared the bar is offered. Ranking
  them further by depth would rank a day's noise. Between the 22 September probe and
  this run, METAx went from 0.26% to 1.26% at $10,000, MSFTx from 1.38% to 0.22%, and IWMx
  from 1.01% to 0.46%. Which company someone is paid in is the payer's choice.

### Left out, and why

**Broad funds with no route.** These eight are in `all-tokens` and look like the broad
funds a payer would want. The aggregator refused each at $1,000 with `Insufficient
liquidity` (82000). None of them was among the 51 that routed at $1 on 22 September.

| | Name in the list | Address |
| --- | --- | --- |
| VTIx | Vanguard xStock | `0xbd730e618bcd88c82ddee52e10275cf2f88a4777` |
| VOOx | Vanguard S&P 500 xStock | `0xffae0b911cb2cb7b49fd75011d99d137c040a9ef` |
| VTx | Vanguard Total World xStock | `0x6d5edeebbc6a4099eb8bb289eb3b80d799f7b28c` |
| VXUSx | Vanguard Total International Stock ETF xStock | `0x91ea54a8a5426c0a0bea55968dd71abce7b92751` |
| IJRx | S&P Small Cap xStock | `0xaa28cb97d7f7e172f54dee950743886d2d65447d` |
| USPXx | Franklin U.S. Equity Index xStock | `0x368192fec58e3150600a1409c631c77f45745bec` |
| IEMGx | Core MSCI Emerging Markets xStock | `0x6a668332825450acd2e449372057d31b3de16a1e` |
| SCHFx | Schwab International Equity xStock | `0xf6d87e523512704c29e9b7ca3e9e6226bdce3ea1` |

**Not candidates.**
- TQQQx is three times leveraged, not a broad fund.
- Sector, country, commodity and bond funds are not broad stock funds, even where they
  route: SOXXx, SMHx, XLEx, EWYx, GLDx, SLVx, SGOVx, TBLLx and the rest.
- wNVDAx is still not in `all-tokens` (see above).

Re-measure these fifteen with `npm run probe -- --only=spyx,qqqx,iwmx,googlx,amznx,aaplx,avgox,crclx,coinx,metax,msftx,mstrx,nvdax,hoodx,tslax`
and re-read the issuer with `npm run check-issuer` before submission.
