# Top up from OKX: what OKX supports, and the helper's words

The issue form checks the payer's USD₮0 and OKB before the button (brief §6.2). When either is
short it says exactly how much, and offers "Top up from OKX": the amounts, this address with a
copy button, and how to withdraw to it on the X Layer network. This file is what was checked
before writing that helper, and the copy to use.

Researched 24 September 2026. okx.com timed out from the research machine, so OKX's own pages
were read through a text proxy of the same URLs and cross-checked against OKLink, Tether and news
reports. Anything not confirmed by a source is marked **unverified**; nothing here is a guess.

## What was checked

| Question | Answer | Status |
| --- | --- | --- |
| Can OKX users withdraw USDT to the X Layer network? | Yes | **Verified.** OKX and Tether, 9 Sep 2025: OKX customers can deposit, withdraw and transfer USDT0 across X Layer and other networks ([OKX Learn](https://www.okx.com/en-us/learn/tether-usdt0-on-x-layer-and-okx); also [The Block](https://www.theblock.co/post/370026/okx-tether-usdt0-unify-stablecoin-liquidity-x-layer-wallet-exchange)) |
| Which token arrives: USD₮0 (`0x779D…3736`, what Warrant pays with) or the older bridged USDT (`0x1E4a…D41d`)? | **USD₮0, `0x779Ded0c9e1022225f8E0630b35a9b54bE713736`** | **Verified.** OKX's USDT0 FAQ lists "Old USDT address: 0x1e4a5963…d41d" and "New USDT0 address: 0x779Ded0c…3736" ([OKX help](https://www.okx.com/en-us/help/usdt0-faq)); OKLink names `0x779D…3736` "USD₮0" ([OKLink](https://www.oklink.com/xlayer/token/0x779Ded0c9e1022225f8E0630b35a9b54bE713736)); X Layer's own account told users to deposit the old USDT on the exchange and withdraw it as USDT0 on X Layer ([X Layer on X](https://x.com/XLayerOfficial/status/1968173394689716642), seen as a search snippet) |
| Can OKX users withdraw OKB to the X Layer network? | Yes, as X Layer's native gas token | **Verified.** OKX's X Layer upgrade notice names "deposits and withdrawals of X Layer (OKB)" ([OKX help](https://www.okx.com/en-us/help/okx-to-support-x-layer-network-upgrade-20251024)); OKB is X Layer's gas token ([X Layer docs](https://web3.okx.com/xlayer/docs/developer/build-on-xlayer/about-xlayer)); OKX stopped OKB withdrawals to Ethereum in Aug 2025 ([OKX help](https://www.okx.com/en-eu/help/x-layer-okt-okb)) |
| The network's name on OKX's withdrawal screen | "X Layer". OKX's fee table labels the USDT row "X Layer (USDT0)", and its notices say "X Layer (OKB)" for OKB | Names **verified** from OKX's fee table and notices ([fees](https://www.okx.com/en-us/fees/withdrawal-info)). The exact label on the app's network picker is **unverified**: check it on a phone before the helper ships |
| OKX's withdrawal fee, USDT on X Layer | 0.0022 USDT | **Verified** on OKX's fee table at the time of reading; it can change, so the helper does not print it |
| Minimum USDT withdrawal on X Layer | Sources disagree (0.01 and 1.1 both seen) | **Unverified** |
| OKB fee and minimum on X Layer | Not found | **Unverified** |
| The steps in the OKX app | Assets → Withdraw → Withdraw crypto → the coin → a new or saved destination → network → address → amount → which account (Funding or Trading) → review the network fee → two-factor check → Confirm | **Verified** from OKX's help centre ([app withdrawal](https://www.okx.com/en-us/help/how-do-i-make-a-crypto-withdrawal-app)). OKX's own warning: the receiving network must match the withdrawal network |
| OKB's price | About $115 to $122 between 20 and 24 Sep 2026, so a dollar is about 0.0085 OKB | Worked arithmetic from [CoinGecko](https://www.coingecko.com/en/coins/okb) and exchange pages; not for the screen |

What this means for the words: withdrawing **USDT** from OKX on **X Layer** lands as exactly the
token Warrant pays with, so the helper can say "USDT" to match what the person sees in OKX, and
"USD₮0" where Warrant names its own balance. The older bridged USDT is a different token on the
same network; a wallet holding only that one is told so elsewhere in the app (`OTHER_STABLE` in
`lib/chain.ts`).

## The helper, word for word

Shown under the issue button when either balance is short. `{…}` are values the form fills in.

> **Top up from OKX**
>
> This wallet needs **{usdMissing} more USD₮0** {and a little OKB for network fees} on the
> **X Layer** network before you can issue this grant.
>
> **{address}** [Copy address]
>
> 1. Open the OKX app and go to **Assets**, then **Withdraw**.
> 2. Choose **USDT**. For the network, choose **X Layer**. On X Layer, OKX sends USD₮0, the
>    dollar token Warrant uses.
> 3. Paste the address above, enter at least **{usdMissing} USDT**, and confirm. OKX shows its
>    own fee before you confirm.
> 4. For network fees, do the same with **OKB** on **X Layer**. A dollar's worth covers many
>    grants.
> 5. Come back to this page when OKX says the withdrawal is complete.
>
> Choose the X Layer network in both steps. Sent on any other network, it will not arrive in
> this wallet here.

Pieces of it, for the states that need less:

| State | Line |
| --- | --- |
| Only USD₮0 short | Drop step 4 and "{and a little OKB for network fees}" |
| Only OKB short | "This wallet needs a little OKB for network fees on the X Layer network before you can issue this grant." Then steps 1, 4 (as step 2: "Choose OKB. For the network, choose X Layer."), 3 without the amount, and 5 |
| Blocked button | "Top up {usdMissing} USD₮0" or "Add OKB for network fees" |
| Wallet holds the older USDT | "This wallet holds the older USDT on X Layer, which Warrant does not use. Withdraw USDT from OKX on X Layer as above to get USD₮0." |

## For whoever builds it

- **{usdMissing}**: what the grant needs minus the wallet's USD₮0 balance, both read as bigint in
  six decimals, shown rounded **up** to the cent, so topping up exactly that is always enough.
  The wallet's balance is read from the chain, never assumed.
- **OKB**: the form knows it is short when the balance is below the simulated issue
  transaction's gas times the gas price. Say "a little OKB", not an OKB figure converted from
  dollars: the price is not something the chain confirms, and OKX's OKB minimum is unverified.
- **{address}**: the connected wallet, checksummed, in full, with a copy button; the short form
  beside it is for reading only.
- Do not show OKX's fee or minimum as numbers; both can change and the minimums are unverified.
  OKX shows them on its own confirm screen.
- Before shipping, open OKX's withdrawal screen on a phone once and check the network picker's
  label for USDT and for OKB. If it is not "X Layer", change the words to match the screen.
