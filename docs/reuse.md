# What came from Scrip, and what replaced it

> Scrip is the founder's other project: an app on Solana for the person being paid. Warrant
> is for the company paying people, on X Layer. Reusing your own design system and your own
> helpers is normal and allowed. What matters for judging is that the work in this
> repository happened inside the build window (17 to 25 September 2026), and the commit
> history is the evidence. Every commit here is inside it.

**The disclosure, as the submission states it:**

> Warrant was built on X Layer during Dev Day. At the start I ported the design system and
> parts of the engine from Scrip, my Solana app for individuals (docs/reuse.md lists what).
> Since then the design has been replaced and the product serves companies.

Times below are UTC. Anyone can check a line with `git show <commit>`.

## What was ported, on 19 September

| Commit | What came from Scrip |
| --- | --- |
| `fdb384f`, 19 Sep 05:07 | A reference copy of Scrip's source in `from-scrip/`: its design tokens, page frame, stub, toasts, ⌘K, formatters, `Outcome<T>`, indexer pattern and RPC helpers. It was never imported by the app |
| `9ad51e9`, 19 Sep 05:21 | `lib/outcome.ts`: `Outcome<T>`, `ok`, `held` and `attempt()`, the habit of failure as a value |
| `bfb9a0d`, 19 Sep 05:31 | **The design system**: `styles/tokens.css` (identical to Scrip's values), `styles/app.css`, `app/landing.css`, `components/app/live.css`; Scrip's fonts (Instrument Sans, IBM Plex Mono, Fraunces); the receipt **stub** (`components/stub/stub.tsx` and `stub.css`); the site frame with its torn-paper seam; the page frame, skeletons, copy and print buttons; the toasts; the motion helpers; `lib/format.ts`, re-decimalled for X Layer (USD₮0 has 6 decimals, xStocks 18) |
| `79475a0`, 22 Sep 11:19 | The ⌘K command palette, after Scrip's |

**Parts of the engine** were ported as patterns rather than files: the indexer's cursor that
only advances on a clean read (`lib/indexer.ts`, written for EVM logs on 19 Sep in
`72a372a`), the SQLite cache's shape (`lib/db.ts`), and the RPC discipline of one paced gate
per endpoint.

## What was never Scrip's

Written for Warrant, for X Layer and for EVM, from the first day:

- **The contracts.** `Payroll.sol` (`9ad51e9`, 19 Sep) and `GrantEscrow.sol` (`afc5708`, 19
  Sep), their 69 Foundry tests, and the adversarial review that closed two vulnerabilities
  (`e1dbb72`, 19 Sep). Scrip's program is Anchor, on Solana, and shares no code with them.
- **The OKX integration.** The aggregator client and route checks (`lib/okx.ts`), the
  liquidity probe across 640 xStocks, the issuer check, the USD₮0 permit, OKX Wallet by QR
  through OKX Connect.
- **The truth rules.** A payment or grant is shown only if its transaction backs it
  (`lib/confirm.ts`, `1ea2a4b`, 23 Sep).
- **The person's signed choice** (EIP-712, `lib/choice.ts`) and payroll where each line
  carries its own stock (Payroll v2, 23 Sep).
- **Warrant's own mark and wordmark**, drawn on 19 Sep in `bfb9a0d` rather than ported.

## What has been replaced since

| When | Commit | What went |
| --- | --- | --- |
| 19 Sep 12:00 | `b8d9992` | Scrip's motion helpers (`reveal`, `roll`) removed |
| 23 Sep 10:17 | `c5f58e5` | Scrip's voice on every surface rewritten in plain words for Warrant |
| 24 Sep 12:25 | `9e328f5` | The `from-scrip/` reference copy removed from the tree |
| 24 Sep | `0704437` | Scrip's receipt stub replaced by Warrant's **payslip**: company to person, a two-part bar for stock and USD₮0, the price, the route, the note and a Paid stamp. "Which became" and the other Scrip words retired |
| 24 Sep | `4d6a8ce`, `0704437`, `2c81fd0` | The person-first pitch ("Get paid in stocks") replaced by the company's: "Give your team stock that vests". The front page, `/me`, payroll, the public record and the company page rewritten around grants and the certificate |
| 24–25 Sep | the redesign | Scrip's tokens, fonts, torn-paper seam and document blue replaced by Warrant's own identity: vault, bond and canvas; Bodoni Moda, Hanken Grotesk and JetBrains Mono; the certificate with its guilloche, seal and vesting rule. `git log -- styles/tokens.css` shows the commit that replaced the tokens |

## What remains from Scrip

Patterns, not looks: `Outcome<T>` and `attempt()`, the cursor-and-cache shape of the record,
the paced RPC gate, the ⌘K palette's behaviour, the toasts' phases and the formatters'
never-"$0" rule. None of Scrip's tokens, fonts, words or components ships on a Warrant page.
