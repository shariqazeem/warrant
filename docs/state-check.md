# State check: the build brief's section 4 against the code and the chain

> Checked 24 September 2026, 12:09 UTC, at commit `48e63c8`, against the working tree, X Layer
> mainnet and the production database. Where the brief and the code differ, the code and the chain
> win, and this file says so.

## Matches

| Brief says | Checked |
| --- | --- |
| Next.js App Router app at https://warrant.world | Yes |
| Routes `/`, `/me`, `/pay`, `/run`, `/run/[id]`, `/grants`, `/receipt/[tx]` | Yes |
| A ⌘K command palette | Yes (`components/shell/jump.tsx`) |
| Payroll v2 `0xd9d06266b9290ba5ee81cc54657844d4a874431d` | Yes; deployed 23 Sep 18:44 UTC, block 71,420,033; byte-identical to a fresh compile |
| GrantEscrow `0xb238d76499616377abd4908e46f29c7ce50908d1`, no owner, admin or upgrade path | Yes; block 71,416,683. Payroll v2 has none either |
| USD₮0, OKX DEX aggregator V6, OKX Connect, OKLink links | Yes |
| The 15 stocks, same issuer, one owner `0x49754062E35f7591B93cc4F9915965be89643a65` that can mint and burn | Yes (`lib/assets.ts`, `docs/liquidity.md`, `scripts/check-issuer.ts`) |
| 69 Foundry and 331 Vitest tests, plus fork proofs | Yes (`README.md` still says 326 Vitest; it is 331) |
| One $2 payment, 0.0026 SPYx, 23 Sep | Yes: tx `0x9efd0b668e6f2c7ff88100163697278b73f53d7f735120d7008720b122809f64`, 18:22:33 UTC, through Payroll v1 `0xbf9c…7ae09` |
| No grants, no signed choices | Yes, as of 12:09 UTC on 24 Sep |
| Keeper not running | Yes: no pm2 process, no cron |
| OKX Wallet QR signing fix deployed, unconfirmed on a phone | Yes: deployed 24 Sep ~09:25 UTC; no signature recorded since |
| Repo has no remote | Yes |
| Tokens identical to Scrip's | Yes (`styles/tokens.css` = `from-scrip/styles/tokens.css`) |
| `--line-strong` undefined; inputs borderless on `/grants` and pay links | Yes |
| Six classes defined twice | Yes: `.wa-field`, `.wa-input`, `.wa-chip`, `.wa-units`, `.wa-mono`, `.wa-actions` |
| Buttons on `/me` and receipts unstyled | Yes: `.wa-action` on `/me`, `.wa-btn` on receipts |
| Placeholders about 2:1 contrast | Yes (≈2.06:1) |
| Scrip's receipt stub still in use | Yes |
| `buildGrant` ignores the recipient's signed choice | Yes (`app/grants/actions.ts`) |
| After issuing, the app stays on `/grants` | Yes (`components/grants/grant-form.tsx`) |

## Differences

| Brief says | Code and chain |
| --- | --- |
| Route `/@[handle]` | There are no handles. The route is `/@0x<address>` (also `/0x…` and `/%40…`). "warrant.world/@name" cannot be entered; a Warrant link is the address link |
| (not listed) | `/grant/[id]` exists: a public, server-rendered grant record with no wallet code. The certificate page is built at `/g/[id]` and `/grant/[id]` redirects to it |
| Tokens at `src/styles/tokens.css` | `styles/tokens.css` |
| 326 Vitest (README) | 331 |

## Facts the brief asks to verify (section 6)

| Claim in the design files | Verified |
| --- | --- |
| "One signature approves the USDT and issues the grant" | True when the wallet signs typed data: USD₮0 has EIP-2612 permit (domain "USD₮0", version 1, verified on chain) and GrantEscrow has `openWithPermit`. If the wallet cannot, the app already approves first and issues second, and says so |
| "Guarantees at least" 0.99× | The app sets `minOut` to the aggregator's `minReceiveAmount` at 1% slippage and the contract enforces it (`BelowMinimum`). Show the real minimum, not a fixed ratio |
| Release fee "0.5%", settable "0% to 2%" | The contract caps `tipBps` at 200 (2%); it has no default. The form's default is 50 bps (0.5%) |
| "Claiming it yourself costs no release fee" | True: `toCaller = caller == beneficiary ? 0 : due × tipBps / 10000` |
| "No owner, no admin and no upgrade path" | True for both Payroll v2 and GrantEscrow |
| Certificate number = grant id, six digits | Ids are sequential from 1 on the current escrow. The first real certificate is No. 000001; the specimen is No. 000000 |
| Custom schedules, including short ones | The contract accepts any duration from 1 second to 3,650 days, with cliff ≤ duration. The form today offers only 1–4 years |
| A future start date | Supported: `Terms.start` is any `uint64`; 0 means now |
| "Vests every second" | Linear per second from `start`; nothing before the cliff; at the cliff the whole accrued share is due at once |
| The stock picker lists all 15 | The list is 15 |

## Gaps the brief assumes are already there

| Brief | Today | Plan |
| --- | --- | --- |
| Simulate with `eth_call` before asking for a signature | Only the keeper simulates; the pay and grant flows call `writeContract` directly | Add `simulateContract` before every send |
| A primary and a fallback RPC | One RPC (`rpc.xlayer.tech`) everywhere | viem `fallback([http(primary), http(fallback)])` with retry |
| Keeper with health endpoint and alerts | A script, not running; no health endpoint; no alerts | Add both; run under pm2 with its own env |
| OG images are certificates | Text cards | The certificate card at `/g/[id]/opengraph-image` |
| `/record` | Does not exist; the front page tape and `/@address` are the public record | P1 |
