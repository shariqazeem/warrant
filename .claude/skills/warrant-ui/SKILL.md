---
name: warrant-ui
description: Warrant's design system, carried over from Scrip. Invoke before building or editing ANY user-facing surface — the front door, pay, runs, grants, receipts, the company page, the shell. Carries the token contract, the two materials, the stub at five sizes, the words, the page patterns, and the rules that keep every page one tone.
---

# Warrant UI

**There is no opening bell.** The world of the old exchange floor, reborn without hours. Two
materials, assigned by surface:

- **Ink**, the dark ground, for the network: the front door's opening and close, the tape,
  the marketing navigation. Paper-coloured text on ink, one accent, no glow, no gradients.
- **Paper**, for every document: a receipt, a run, a grant, the company's page, the pay form.
  White stubs on paper, ruled rows, a perforated edge.

Dark is not a mode. It is where the crowd is. Spend the boldness in one place, the stub, and
keep everything else quiet. A document, not a terminal.

## The words

| In code | On every surface |
| --- | --- |
| a `Paid` event when drawn | a **stub**; it "prints" |
| a batch | a **run** |
| `GrantEscrow` | a **grant**, which **vests** |
| the recipient's address | **their own wallet** |
| the asset | a **stock position**, never "equity" or "shares" |

Never "token", never "yield", never "projected". Arithmetic on the past, labelled, is the
limit. Say what the issuer can do on every asset row.

## Non-negotiable rules

1. **`styles/tokens.css` is the only place a value is defined.** Colour, radius, shadow,
   spacing, type size, duration. A per-surface stylesheet may alias (`--line: var(--border)`);
   it must never redeclare a palette value. Never write a raw hex in a component.
2. **No Tailwind utility classes, ever.** `globals.css` is `@import "tailwindcss"` for
   preflight and nothing else. Write real CSS in a per-surface file, prefixed `wa-`.
3. **Green and red mean money.** `--ok` is settled or delivered, `--err` is failed or refused.
   Neither is decoration.
4. **One accent**, document blue `--accent`, on every interactive and brand element. On ink
   it is `--accent-inverse`.
5. **Figures are mono with tabular numerals.** Amounts, units, addresses, hashes, dates.
   **Units are the largest thing on any page they appear on.** Units before dollars.
6. **Radii are 6 / 10 / 16.** `--r-pill` is for status chips only.
7. **No emoji.** Lucide line icons, `size={14|16}`, `strokeWidth={2}`.
8. **Never render a number the chain cannot confirm.** An empty feed says in words what will
   fill it. Never a sample row, never a zero standing in for unknown.
9. **Server-first.** React Server Components by default; `"use client"` only at interactive
   leaves. A receipt page ships no client JavaScript except the copy button.
10. **Motion is a scene entering, never decoration.** `<Reveal>` adds `is-in` when a scene is
    reached, which is a scroll check and deliberately not an IntersectionObserver: an
    observer never fires for a scene the reader jumped over, and a missed scene is invisible
    content. Whatever is hidden by default must be revealed by something that cannot fail to
    run. Text never fades up on its own. Hover changes colour, not position.
11. **Sentence case everywhere.** No all-caps eyebrows, no accent-coloured word in a headline,
    no arrows appended to buttons. Lines under eighty characters.
12. **Per-row disclosure, never a banner.**

## Token quick reference

```
surface   --bg #f7f5ef   --surface #fff   --border #e4dfd3   --border-strong #cdc5b4
text      --ink #14161c  --ink-muted #5a5d66  --ink-faint #8b8e97
brand     --accent #2b4acb  --accent-strong #1f3aa8  --accent-soft #e8edfb
money     --ok #15803d  --err #dc2626  --warn #b45309
ink side  --surface-inverse  --ink-inverse  --accent-inverse #9db0f7  --ok-inverse
type      --fs-display/h1/h2/lead/body/small/caption/mono, --fs-units, --fs-units-sm
space     --s-1..--s-12;  --measure 720px;  --measure-wide 1040px
motion    --dur-1 160ms  --dur-2 320ms  --dur-3 640ms  --ease-out  --ease-spring
```

## The stub, at five sizes

One object, everywhere. Nothing else on the site may look like a card; if it is not a stub it
is a ruled row or a paragraph.

1. **the tape row** — one line on the front door
2. **the wall stub** — compact, in a run and on the company page
3. **the register stub** — full rows, printing as a payment settles
4. **the receipt** — the hero of `/receipt/[tx]`, print-like
5. **the share card** — the `opengraph-image` on every public record

A white sheet on paper with a perforated top edge, ruled rows, and the units at `--fs-units`.

## The mark

Warrant needs its own, and it must not be Scrip's stub glyph. Draw it in stroke on
`currentColor` in the same line register as the Lucide icons beside it, so the rail, the nav
and the receipt header all tint it from their own text colour. A warrant is a document that
entitles the holder to something; a seal or a countersigned corner reads right.

## Page patterns

| Surface | Pattern |
| --- | --- |
| `/` | Ink opening: the headline and a real payment printing live. Then the tape. Then what a stock could not do before, as ruled rows. Then the paper tears off: honesty rows, then the public record. Ink close |
| `/pay` | One form, one confirm, one receipt. Fields as ruled rows, the quote beside them, everything with a default folded away |
| `/run` | The file becomes lines before anything is signed. One signature. Then the receipts print in sequence |
| `/grants` | Open with a cliff and a duration; the schedule drawn as a bar. Revoke and close on the ones open |
| `/receipt/[tx]` | The stub as the hero, then two sheets: what was paid, where it is anchored. Unshelled, print-like |
| `/@company` | Paid in ownership since, people paid, the total, grants vesting, every payment as a row with its reason |

## Every state, designed

| State | What to do |
| --- | --- |
| Loading | `SkeletonPage` in the real layout. Never a spinner, never a bar that reads as a figure |
| Empty | What will fill it, in words |
| In flight | One toast, bottom left: building, waiting for your wallet, confirming, settled, not sent. The same words as the button. Settled links the object and leaves; a failure stays until dismissed |
| Success | The object appearing. Never a green banner |
| Error | What happened and the one action that might work |
| Refused | A refusal is a receipt too. Name the rule that caused it |

## Before you finish a surface

- every colour is a token or an alias
- units and hashes are mono and tabular, and units are the largest thing on the page
- an empty state is honest and designed, not a spinner and not a sample
- it holds at 375px, 768px and 1440px, and nothing runs under the mobile bar
- keyboard focus is visible and uses `--accent`; AA contrast on both materials
- every button says what happens, and the confirmation uses the same word
