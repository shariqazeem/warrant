# Submission draft: OKX Dev Day 2026

> For the founder to paste into the submission form. Every claim here is live on X Layer
> mainnet or in the repository; a proof that has not landed yet is marked pending, and
> should be filled from the README's proof table before submitting. Check the form's field
> limits and trim from the end of each section, never the disclosure.

## Project name

Warrant

## One line

Give your team stock that vests.

## Track

X Layer: tokenized stocks and RWA.

## Links

- Live app: https://warrant.world
- Repository (public, full history): https://github.com/shariqazeem/warrant
- Video: https://youtu.be/zoJZ9jAXkAk
- The public record: https://warrant.world/record
- A live certificate: https://warrant.world/g/3 (sealed, vesting every second until 9 October)

## Description

Teams of 5 to 50 people that pay in USDT across borders (crypto startups, agencies, DAOs)
cannot give equity to people in six countries, so their best people leave for a raise.
Warrant gives them the retention tool public companies use: stock that vests.

A company picks one of its people, a stock (the S&P 500, NVIDIA or thirteen more xStocks)
and an amount. The grant buys the stock on day one through the OKX DEX aggregator and holds
it in an escrow nobody can spend. It vests every second, with an optional cliff, and what
has vested belongs to the person. The company can cancel the unvested part of a revocable
grant; sealing it makes it irrevocable. Anyone can release what is due and earn the grant's
small release fee, so the stock arrives even if nobody remembers.

Every grant is a numbered certificate with its own engraving, the OKX DEX route it was
bought through, and the transaction it was recorded in. It opens on a phone from a link, with
no wallet and no account, and shows what has vested, second by second. The person connects
OKX Wallet by QR to claim.

Payroll comes second: one signature pays a whole team in one transaction, each person in the
split and stock they chose with a free signature, and every line gets a payslip anyone can
open.

## How it uses X Layer and OKX

- **X Layer mainnet** (chain 196): both contracts are deployed there, and every grant and
  payslip is a transaction there. Fees are paid in OKB.
- **xStocks**: every grant holds tokenized stocks for its whole schedule.
- **OKX DEX aggregator** (V6): every grant and payroll line is bought through it at a live
  quote, with a minimum the contract enforces; the route is printed on the certificate.
- **OKX Wallet**, connected by QR through OKX Connect, for signing choices and claiming.
- **USD₮0**, the USDT most wallets on X Layer hold, with an EIP-2612 permit so approval can
  be a signature.

## Trust anyone can check

- `GrantEscrow` `0xB238D76499616377abD4908E46F29C7CE50908D1` and `Payroll`
  `0xD9d06266B9290bA5ee81Cc54657844D4a874431d`: no owner, no admin, no pause, no upgrade
  path. Both are verified on OKLink as exact matches of the repository's source.
- The issuer's powers are disclosed on every stock's row: one upgradeable owner can create
  units, destroy units held by any address, replace the code and hand those powers on. An
  xStock is a stock position with economic exposure and no voting rights.
- 69 Foundry tests, the Vitest suite, and fork proofs against real mainnet state and real OKX
  routes. The vesting schedule is one fixture shared by Solidity and TypeScript.
- A proof table in the README links every claim to its transaction.

## A 60-second path for judges

1. Open a live certificate with no wallet: https://warrant.world/g/3
2. Watch it vest: "Vested now" moves every second.
3. Click its transaction: the opening on OKLink, with the USD₮0 in and the stock bought.
4. See that the escrow has no owner: GrantEscrow on OKLink, and its source in the repository.
5. Open the proof table: https://github.com/shariqazeem/warrant#proof-table

## What is real today

- On mainnet: both contracts; the first real payment ($2, 0.0026 SPYx, 23 September,
  transaction `0x9efd0b668e6f2c7ff88100163697278b73f53d7f735120d7008720b122809f64`).
- On 25 September, from the founder's own wallets: three grants issued through OKX DEX
  routes; one cancelled after its cliff (the unvested part returned at once, the vested part
  released to the person 44 seconds later by the keeper); one released by the keeper in six
  steps and sealed; one sealed and still vesting until 9 October. A payroll run paid three
  wallets their three different signed choices (100% SPYx, 50% NVDAx, all dollars) in one
  transaction. Every transaction is in the README's proof table.
- The release service ran on its own throughout: every release above was sent by it, with
  nobody pressing anything.
- A grant from a team that is not the founder's: not yet.
- Signed choices: three, all the founder's wallets; none yet from other people.

## The business

Warrant charges nothing to issue a grant or run payroll, and its contracts take no cut. It
runs the release service, which earns the release fee each grant carries, and will sell a
company tier: exports for the accountant, team lists and reminders.

## Disclosure

Warrant was built on X Layer during Dev Day. At the start I ported the design system and
parts of the engine from Scrip, my Solana app for individuals (docs/reuse.md lists what).
Since then the design has been replaced and the product serves companies.

## Team

{The founder's name, role and contact, as the founder wants them shown.}
