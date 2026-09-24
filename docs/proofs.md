# Mainnet proofs: the runbook

> For the founder, who signs; the engineer prepares each step and records every hash here as it
> lands. Total spend under about $30 plus gas unless the founder says otherwise. Wallets the founder
> controls are labelled as the founder's on every certificate and in the proof table. Nothing is staged.

## Before any proof

1. Fund the paying wallet on X Layer: about **$30 of USD₮0** (`0x779Ded0c9e1022225f8E0630b35a9b54bE713736`)
   and about **$1 of OKB** for fees. Withdraw USDT from OKX on the X Layer network (it lands as USD₮0;
   the "Top up from OKX" steps under the wallet panel on `/grants` walk through it), or swap in OKX Wallet.
2. A **second wallet the founder controls** (an OKX Wallet account or MetaMask account) with a little
   OKB, to play the recipient for Grants A and B. Its address goes into the proof table as "founder's
   second wallet".
3. Fund the keeper: about **$1 of OKB** on X Layer to `0x173B066A5558697b3ce5dC26b57764162ec55E79`. It
   already runs on the VM under pm2 (`docs/keeper.md`) and passes every 60 seconds, but sends nothing
   while it holds under 0.002 OKB. Within a minute of the OKB landing, `curl localhost:3101/health` on
   the VM answers `ok: true`, and certificates say their stock is released automatically.
4. OKX Wallet QR signing confirmed on the founder's phone: sign a choice at `/me` and see it saved.
5. Screen recording on (Cmd+Shift+5 on the Mac, screen recording on the phone). Every proof is also
   footage for the video.

## Grant A: the demo grant, every state on camera

| Step | Who | What | Record |
| --- | --- | --- | --- |
| 1 | Founder | `/grants`: recipient = second wallet; SPYx; **$3**; Custom schedule **2 hours, no cliff**; "Keep it revocable" (so sealing is its own step); Issue | issue tx, grant id |
| 2 | Founder | On the certificate: "Seal it now" | seal tx |
| 3 | Keeper | Within a few minutes the keeper releases what is due; "Released" rows appear on the certificate with the keeper's fee | first release tx |
| 4 | Founder, second wallet | Open the certificate on the phone, connect by QR, "Claim … now" (no fee for the recipient) | claim tx |
| 5 | Founder, second wallet | "Show SPYx in OKX Wallet" | screenshot |
| 6 | Anyone | After 2 hours: the keeper or the founder releases the rest; "Archive" (close) | final release tx, close tx |

## Grant B: revocable, cancelled

| Step | Who | What | Record |
| --- | --- | --- | --- |
| 1 | Founder | Recipient = second wallet; SPYx; **$3**; Custom **30 days, 5-minute cliff**; keep revocable; Issue | issue tx |
| 2 | Wait | Past the cliff (5 min) | — |
| 3 | Founder | "Cancel the unvested part"; the confirmation states what returns and what stays theirs | revoke tx |
| 4 | Second wallet | Claim what had vested | claim tx |

The certificate then shows the revoked state: what vested and stayed theirs, what went back.

## Grant C: a real team, a real person, a real schedule

- Not from the founder's wallets. A team from `docs/outreach.md` issues a grant (any amount, even $5)
  on the **Retention** preset (2 years, 6-month cliff) or **Standard**.
- Record: issuer address, recipient address, grant id, issue tx, and whether they sealed it.
- Ask before naming anyone in the video.

## The payroll run

- 3 to 6 real people, each with a **different signed choice** (some stock, some all dollars, one at
  100%), paid $3–5 each in **one signature** from `/run`.
- Record: run id, the transaction, each payslip link.

## Signed choices

- At least **10 real people** sign a choice at `/me`. Free, no gas. Record the count from the
  production database (never names).

## The video's grant

- Shortly before recording (Fri 18:00 UTC), issue **one fresh grant** ($3–5, Custom 1 hour, 10-minute
  cliff, sealed) so the certificate visibly ticks on camera and the cliff passes during the shoot.

## Proof table (fill as each lands)

| Claim | Transaction | Block | Time (UTC) |
| --- | --- | --- | --- |
| First real payment, $2 → 0.0026 SPYx (Payroll v1) | `0x9efd0b668e6f2c7ff88100163697278b73f53d7f735120d7008720b122809f64` | 71,418,717 | 23 Sep 18:22 |
| Grant A issued | pending | | |
| Grant A sealed | pending | | |
| Grant A released by the keeper | pending | | |
| Grant A claimed by the recipient | pending | | |
| Grant A closed | pending | | |
| Grant B issued (revocable) | pending | | |
| Grant B cancelled | pending | | |
| Grant B claimed (what had vested) | pending | | |
| Grant C issued by a real team | pending | | |
| Payroll run, N people, one signature | pending | | |
| Signed choices | count: pending | | |
| The video's grant | pending | | |
