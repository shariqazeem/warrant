# What ports from Scrip, and what does not

> Everything under `from-scrip/` was copied from `/Users/macbookair/projects/webgold` on
> 19 September 2026. It is a reference library, not a running app. Copy a file into place
> when you need it, do not wire the whole folder in at once.
>
> Scrip is the same author's other project. Reusing your own design system and your own
> helpers is normal and allowed. What matters for judging is that the work in *this*
> repository happened inside the build window, so commit as you go.

---

## Ports as it is

Drop these in and change almost nothing.

| File | Note |
| --- | --- |
| `styles/tokens.css` | **The design contract.** Every colour, radius, type size and duration. Never write a raw hex anywhere else |
| `styles/app.css` | The page frame's aliases and layout |
| `styles/globals.css` | Tailwind preflight only; no utilities are used anywhere |
| `components/motion/reveal.tsx` | A scene enters when reached. A scroll check, deliberately not an IntersectionObserver. Read the comment inside before changing it |
| `components/motion/roll.tsx` | A figure rolls to its real value. Takes `kind`, never a function prop |
| `components/toast/*` | Building, waiting for your wallet, confirming, settled, not sent. `useTxToast` mirrors a form's own phase |
| `components/app/page-frame.tsx` | The frame every shelled page wears, plus `EmptyState` |
| `components/app/skeleton.tsx` + `.css` | Loading in the real layout. Never a spinner, never a bar that reads as a figure |
| `components/app/copy-text.tsx`, `print-button.tsx` | Small, no dependencies |
| `components/site/site-frame.tsx` + `site.css` | The marketing frame: dark nav, perforated seam, paper body, `SiteSection` and `Row` |
| `components/shell/jump*.tsx` | ⌘K. Rewrite `jump-resolve.ts`'s page list and shapes for this project |
| `lib/outcome.ts` | `Outcome<T>`, `ok`, `held`, and `attempt()` as the last guard. **Use this everywhere** |

## Adapt

The shape is right; the chain or the types are not.

| File | What to change |
| --- | --- |
| `components/stub/stub.tsx` + `stub.css` | The one object. Props stay; the rows change from Solana words to EVM ones |
| `components/stub/from-row.tsx` | Rewrite for the EVM receipt row. The idea of one builder from a cached row is what you want |
| `components/org/pay-one.tsx` | The closest thing to Warrant's `/pay` that exists. Same fields, same phases; swap the wallet and the transaction builder |
| `components/org/run-builder.tsx` | The CSV to lines to one signature flow. On EVM this becomes a single `payMany`, which is simpler than Solana's `signAll` |
| `components/org/grant-form.tsx`, `grant-bar.tsx`, `grant-actions.tsx` | The grant surfaces. The schedule maths is identical |
| `components/org/org-public.tsx` + `org.css` | Becomes `/@company` |
| `lib/format.ts` | `usdc`, `unitsFromRaw`, `bps`, `dateUTC`, `short`. **Watch decimals**: USDT on X Layer is 6, xStocks are 18 |
| `lib/db-schema.ts` | The cache shape: receipts, runs, grants. Replace Solana fields (pda, slot, signature) with EVM ones (tx hash, log index, block) |
| `lib/handle.ts` | Only if Warrant has handles. It may not need them; an address is enough for v1 |

## Reference only, do not copy

Read these for the pattern, then write the EVM version.

| File | Why |
| --- | --- |
| `lib/indexer-reference.ts` | Scrip's indexer. The pattern to keep: a cursor, batch reads, the cursor only advances when nothing was held. The EVM version reads logs, which is simpler. **Remember the public RPC refuses wide ranges** |
| `lib/limiter.ts`, `gated-fetch.ts`, `http.ts` | The RPC discipline that took a day to learn: one gate per endpoint, a coordinated back-off, and a kept-alive socket because Node's fetch ignores the agent. If X Layer's public RPC throttles, this is the answer already written |
| `components/brand/scrip-mark.tsx`, `wordmark.tsx` | The pattern for a mark drawn in stroke on `currentColor`. **Warrant needs its own mark**, not Scrip's stub glyph |

## Do not port

- The Anchor program. Warrant's contracts are Solidity and much simpler.
- Anything Pyth. On EVM you bound the fill with the router's own quote and a `minOut`.
- The scaled-UI multiplier work. xStocks rebase inside `balanceOf` on EVM.
- The keeper's sweep logic. Warrant has no rule on an address; a payment is initiated by a
  payer, not detected by a watcher. The only keeper job is `vest()`.
- Scrip's copy. Same voice, different sentences. Do not ship a page that says "your income
  invests itself"; that is the other product.

## The voice

Declarative, short, no exclamation marks. Never "unlock" or "seamless". Units before
dollars, and units are the largest thing on a page. Sentence case everywhere. Lines under
eighty characters. A refusal is explained in the same words as the button that caused it.
