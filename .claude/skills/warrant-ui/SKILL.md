---
name: warrant-ui
description: Warrant's design system, security printing made modern. Invoke before building or editing ANY user-facing surface — the front page, issuing a grant, the certificate page, /me, payroll, the public record, the company page, receipts, the nav and footer, error pages. Carries the materials, the palette and type tokens, shape and motion, the words, the five signature objects (certificate, seal, vesting rule, specimen, payslip), the shared classes, every state, and the rules that keep every page one voice.
---

# Warrant UI

**Warrant looks like a vault and a stock certificate, made modern.** Deep green, cream bond
paper, fine engraving and one oxblood seal. It shares nothing with Scrip: not its palette,
its fonts, its words or its stub. If a surface would look at home on an exchange floor, it is
wrong.

The one line it serves: **give your team stock that vests.** Company first. The certificate
is the object people remember; everything else stays quiet so it can be loud.

## Materials, assigned by surface

| Material | Where | Text on it |
| --- | --- | --- |
| **Vault** `--vault` | The nav, the hero, the footer. Bands inside it are `--vault-raised`, hairlines `--vault-line` | `--on-vault`, then `--on-vault-2`, then `--on-vault-3`. Links hover to `--on-vault-hover` |
| **Canvas** `--canvas` | Every app page: issuing a grant, `/me`, payroll, records, receipts | `--ink`, secondary `--muted`. Dividers `--rule` |
| **Bond** `--bond` with **engrave** `--engrave` | Certificates, and nothing else | `--engrave`, secondary `--muted-bond` |

- A vault band is the class `.wa-vault` (the older name `.wa-dark` is the same rule).
- The vault meets the canvas along a plain 1px `--vault-line` rule. No torn or perforated
  edges anywhere.
- Inputs, chosen options and panels sit on `--surface` (white). An option not chosen sits on
  `--field-bg`.
- Bond is never a page background and never a card. If it is cream, it is a certificate.

## Palette

Every value lives in `styles/tokens.css`. Never write a hex anywhere else.

| Token | Hex | Use |
| --- | --- | --- |
| `--vault` | #0B2A21 | Hero, nav, footer; primary buttons on canvas |
| `--vault-raised` | #0F3327 | Bands on vault |
| `--vault-line` | #24493B | Hairlines on vault |
| `--vault-field` | #6E8C80 | Border of a secondary button on vault |
| `--bond` | #F2ECDC | Certificates; primary buttons on vault |
| `--canvas` | #EEF2EE | App page background |
| `--engrave` | #173B2F | Lines and text on certificates |
| `--ink` | #0F1A15 | Body text on canvas |
| `--muted` | #45544C | Secondary text on canvas and surface; placeholders |
| `--muted-bond` | #4A5E54 | Secondary text on bond |
| `--on-vault` / `-2` / `-3` | #F2ECDC / #C9D3CC / #A9B8AF | Primary, secondary, tertiary text on vault |
| `--on-vault-hover` | #FFFFFF | A link on vault, hovered |
| `--rule` | #C5D0CA | Dividers on canvas |
| `--field` | #9AABA2 | Borders of inputs and secondary buttons |
| `--field-bg` | #F6F8F6 | An option not chosen |
| `--surface` | #FFFFFF | Inputs, chosen options, panels |
| `--seal` | #8C1D1D | The seal, the word "irrevocable", the seal button, the cliff marker |
| `--foil` | #B38B3E | One hairline on a sealed certificate; icons and focus rings on vault |
| `--settled` | #0F7A4F | Success, always with a check icon |
| `--warn` | #9A5B00 | Waiting, stale, short of funds |
| `--refused` | #B42318 | Failed, refused |

**Contrast.** Every text pair passes 4.5:1, or 3:1 at 24px and up. Checked: ink on canvas
15.8, muted on canvas 7.1, muted-bond on bond 5.9, on-vault-3 on vault 7.4, bond on vault
13.0, bond on seal 7.7, settled 4.7, warn 4.8 and refused 5.8 on canvas. **Settled, warn and
refused never go on vault** (under 3:1 there). Check any colour you add before you add it.

Colour means something: settled is success, refused is failure, warn is waiting, seal is
permanence. None of them is decoration. There is no blue anywhere.

## Type

| Family | Token | Use |
| --- | --- | --- |
| Bodoni Moda (variable weight and optical size, italic) | `--font-display` | Headlines, the wordmark, everything on a certificate |
| Hanken Grotesk (400 to 700) | `--font-ui` | Every word of the interface |
| JetBrains Mono (400, 500) | `--font-mono` | Addresses, hashes and live counters, and nothing else |

- All three load through `next/font` in `app/layout.tsx`, self-hosted, so nothing shifts.
- Headlines: Bodoni Moda 500, tracking `--tracking-head` (−0.02em). `h1` and `h2` get this
  by default.
- `body` sets `font-variant-numeric: lining-nums tabular-nums`: every number lines up.
- Scale: `--fs-display` (72px at 1440), `--fs-h1` (46px), `--fs-h2` (28px), `--fs-lead`
  (20px on vault, 16.5px on canvas, switched by the vault class), `--fs-body` 16px,
  `--fs-small` 14px, `--fs-caption` 13px, `--fs-label` 15px, `--fs-money` 18px, `--fs-mono`
  13.5px. Line heights `--lh-display`, `--lh-h1`, `--lh-h2`, `--lh-lead`, `--lh-body`.
- **Units are the largest thing on any page they appear on.** On a certificate they are
  Bodoni Moda 600; elsewhere use `.wa-units` (`--fs-display`) or `.wa-units-sm` (`--fs-h2`).
- All caps only for engraved text on certificates and seals ("IRREVOCABLE"), with
  `--tracking-caps`.

## Shape and motion

- **Radius:** `--r-control` 6px for buttons, inputs and chips; `--r-panel` 8px for panels and
  notices; `--r-cert` 3px for certificates. No pills.
- **Shadow:** one, on certificates only. `--shadow-cert` on canvas, `--shadow-cert-vault` on
  vault. No card shadows, no floating shadows, no glows, no gradient washes.
- **One orchestrated moment per screen.** A certificate engraves in:
  1. the pattern wipes in over `--dur-wipe` (1.3s, `--ease-wipe`);
  2. the text rises in sequence (`--dur-rise`);
  3. the seal lands last (`--dur-press`, `--ease-press`).
- Hover changes colour, never position. `--dur-1` (160ms) for hover and press.
- Numbers tick without moving the layout: tabular figures, fixed decimals, only the number
  re-renders, paused when the tab is hidden.
- Under `prefers-reduced-motion` every final state shows at once. `tokens.css` does this
  globally; do not fight it.

## Words

- **Use:** certificate, grant, seal, vest, release, claim, payslip, your people.
- **Retired, never on screen:** stub, prints, tape, floor, "which became", "get paid in
  stocks", ownership as a pitch.
- **Voice:** plain verbs, active voice, sentence case. Plain English for someone who has never
  used crypto: no "permit", "calldata", "minOut" or "run id" on screen.
- **Buttons say exactly what happens:** "Issue certificate for $500", "Seal it now",
  "Claim 0.052 SPYx", "Grant stock". A blocked button names what is missing: "Add their
  wallet address", "Enter a grant value", "Top up 12.40 USD₮0".
- **Errors** say what happened and what to do next. They never apologise.
- **The asset** is "a stock position" or "economic exposure", never "shareholder",
  "equity ownership" or "shares". xStocks carry no votes.
- **Avoid:** emoji; all-caps labels (except engraved certificate text); meta strings joined
  with middle dots; "→" on buttons; rows of identical rounded cards; gradient washes.

## The five signature objects

1. **The certificate** (`components/cert`). Landscape 760×468 on desktop, portrait 350×520 on
   phones. Bond, engraved border and rosette from `guilloche()` seeded by chain id, escrow
   address and grant id (memoised). "Certificate of grant", "No. 000042", "This certifies
   that", the recipient, "is granted", the units and symbol, what it was bought for and at
   what price, the real route, the schedule sentence, the vesting rule, granted by, and the
   transaction. Prints as A4 landscape; the share image is the certificate.
2. **The seal.** Unsealed: a dashed outline, "Revocable, until sealed". Sealed: oxblood with a
   scalloped edge, the mark, "IRREVOCABLE" and the number. The press plays when the seal
   transaction confirms, never before.
3. **The vesting rule.** An engraved line with month ticks and an oxblood cliff marker. Vested
   is hatched, released is solid. "Vested now" ticks every second at 8 to 10 decimals; before
   the cliff it reads "Accruing… unlocks on {date}".
4. **The specimen.** While a grant is being filled in, the certificate previews live under a
   diagonal "Specimen" watermark, numbered 000000. It disappears only when the issue
   transaction confirms.
5. **The payslip** (`components/stub`, for payroll lines). Company to person, a two-part bar
   for stock against USD₮0, the units in large type, the price, route and note, and a small
   "Paid" stamp. A plain sheet on `--surface` with a 1px `--rule`, never a certificate.

Nothing else is an object. If it is not one of these five, it is a ruled row or a paragraph.

## The shared classes

A class is defined in exactly one stylesheet. Surfaces may refine a class in context
(`.wa-me .wa-actions`), never define it again.

- `styles/globals.css`, loaded by the root layout on every page: the reset, then the
  primitives any page can render.
- `app/landing.css`: the page frame.
- `components/site/site.css`: the nav, the skip link and the footer.
- `components/pay/pay.css`: the form, loaded by every form component.
- Everything else lives beside its component (`grants.css`, `stub.css`, `jump.css`…).

| Class | Where | What it is |
| --- | --- | --- |
| `.wa-vault` (`.wa-dark`) | globals | A vault band: background, text, links, foil focus, the larger lead |
| `.wa-btn` / `.wa-action` | globals | A secondary button: surface, 1px field border, ink, 44px |
| `.wa-btn.is-primary` | globals | Vault with bond text on canvas; bond with vault text on vault |
| `.wa-btn.is-seal` | globals | Oxblood with bond text: "Seal it now" |
| `.wa-btn.is-quiet` | globals | Underlined words, no box: "Issue another" |
| `.wa-btn.is-large`, `.is-block` | globals | 52px tall; full width and 56px tall |
| `.wa-btn[disabled]` | globals | Blocked: surface, field border, muted text, still readable |
| `.wa-actions` | globals | A row of buttons |
| `.wa-linkish` | globals | A button that reads as an underlined link in a sentence |
| `.wa-kicker` | globals | A small sentence-case label above a headline |
| `.wa-units`, `.wa-units-sm` | globals | Units in Bodoni 600, at `--fs-display` or `--fs-h2` |
| `.wa-mono` | globals | An address or a hash |
| `.wa-fine`, `.wa-refusal` | globals | Small print; what stopped it, in refused |
| `.wa-nothing` | globals | An honest empty state: a line in bold, then what will fill it |
| `.wa-spin` | globals | The only spinner, inside a busy button |
| `.wa-landing` | landing | The page wrapper: canvas, ink text |
| `.wa-tear` | landing | The plain 1px vault-line rule where vault meets canvas |
| `.wa-sec`, `.wa-sec.is-wide` | landing | A 720px reading column; the frame's full 1296px |
| `.wa-display`, `.wa-h1`, `.wa-h2`, `.wa-lede` | landing | Hero headline, page headline, section headline, the lead |
| `.wa-rule-row` (`.k`, `.v`) | landing | A ruled label and value |
| `.wa-header`, `.wa-skip`, `.wa-nav*`, `.wa-site-foot` | site | Nav with skip link, footer |
| `.wa-field`, `.wa-input`, `.wa-money` | pay | A labelled field, a 48px input, a money box |
| `.wa-chip` | grants | Where a grant stands: sealed, revoked, closed |

Inputs are 48px tall with a 1px `--field` border, `--r-control` and `--surface`; addresses in
13.5px mono, money in 18px ui; labels 15px 600. Focus: 2px `--vault` outline on canvas,
`--foil` on vault. Links inside running text are underlined; nav links and buttons are not.

**Landmarks.** A page is the vault band with `<SiteNav />` (a `<header>` holding the skip
link and the nav), the `.wa-tear` rule, `<main id="main">`, and the vault band with
`<SiteFoot />` (a `<footer>`). Nothing sits outside a landmark.

## Every state, designed

Every screen designs its loading, empty, error and success states.

| State | What to do |
| --- | --- |
| Loading | The real layout with ruled skeleton rows. Never a spinner, never a bar the shape of a number |
| Empty | What will fill it, in words: "No grants yet. When a team grants you stock, its certificate appears here, vesting." |
| Waiting on a wallet | The button says "Confirm in your wallet"; one toast says the same words |
| Submitted | "Engraving…" with the transaction link; `aria-live` on the status |
| Success | The object appearing: the certificate engraving in, the seal pressing. Never a green banner. Settled text always carries a check icon |
| Failed | What happened, the decoded reason, and "Try again". A wallet rejection is normal, not an error |
| Refused | Name the rule that stopped it |

## Rules that stay

1. `styles/tokens.css` is the only place a value is defined. No hex, font name, radius or
   shadow anywhere else.
2. No Tailwind utility classes. `globals.css` is the reset only; real CSS lives in per-surface
   files, prefixed `wa-`.
3. **Never render a number the chain, a live OKX DEX quote or the user's own input cannot
   confirm.** No sample values, no seeded grants, no invented stats. A worked example is
   labelled as arithmetic.
4. **Units are the largest thing on any page they appear on.**
5. **Disclose what the issuer can do on every asset row**, per row, never as a banner.
6. Plain verbs; buttons say exactly what happens, and the confirmation uses the same word.
7. Server-first; `"use client"` only at interactive leaves.
8. Touch targets at least 44px; a label on every input; keyboard reachable with visible focus.
9. No emoji. Line icons at 14 to 30px, stroked, `--foil` on vault, `currentColor` elsewhere.

## Before you finish a surface

- every colour, font, radius and shadow is a token; `grep "#" yourfile.css` finds nothing
- the words pass the list above: no stub, prints, tape, floor, middle dots or arrows
- units are the largest thing on the page, in tabular figures
- loading, empty, error and success are designed, and no number is unconfirmed
- it holds at 390px, 768px and 1440px with no sideways scroll
- focus is visible, contrast passes on every material, motion stops under reduced motion
