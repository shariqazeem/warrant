# OKX Dev Day 2026 — the brief, and every fact checked

> Facts verified on 18 and 19 September 2026, by direct RPC call or by reading the source.
> Where something was not verified, it says so. Do not act on an unverified line without
> checking it first.

---

## The event

| | |
| --- | --- |
| Online build period | 17 to 25 September 2026 |
| Submission | **25 September 2026, 23:59 UTC** |
| Finalist selection | 28 to 30 September |
| Live finale | 7 October 2026, OKX Singapore, Marina Bay Financial Centre |
| Prize pool | Up to US$100,000 across winning teams. The largest share sits with teams who demo live in Singapore; remote teams are still judged and can still win |
| Travel | OKX pays nothing toward travel, accommodation or visas. Do not book non-refundable travel until OKX confirms a finalist place in writing |
| Presenting | 3 to 5 minutes in front of a judging panel, with a working prototype and a GitHub repository |

### The two tracks

Pick one primary track. A project may use both.

1. **X Layer: tokenized stocks and RWA.** Their own examples: "data and portfolio tools,
   **asset-based payment or commerce experiences**, investor or issuer tooling and new ways
   for users and assets to interact onchain."
2. **OKX AI: agents and AI-native businesses.** Agent services, data or API services, tools
   that help agents work or transact with users and other agents.

**Warrant's primary track is 1.** Payroll in tokenized equity is an asset-based payment
experience, quoted from their own words. The agent angle is a closing sentence, not the
product.

### Partners, who are also judges and mentors

Amazon Web Services, Morningstar, Paxos, MoonPay, Centrifuge, **xStocks**, Plug and Play,
Maximum Frequency Ventures, Liminal. Community: Claude Code Singapore, EasyA, Surgence Labs.

Read that list as a signal: payments companies and asset issuers. A product about paying
people in an issued asset speaks directly to Paxos, MoonPay and xStocks.

### What they said they want

"We are looking for working products, not pitch decks." Judging criteria named in the builder
kit: innovation, completeness, user value, technical execution, meaningful X Layer or OKX AI
integration, growth potential, contribution to the OKX ecosystem.

Existing projects are allowed, but judges assess **work completed during the official build
period**. Provide the list of features added and the commit history as evidence. A new
deployment alone does not qualify; a working X Layer integration, smart contract, user flow,
agent service or payment flow does.

---

## X Layer, verified

| | |
| --- | --- |
| Chain id | **196** (`0xc4`), confirmed by `eth_chainId` |
| RPC | `https://rpc.xlayer.tech`, live, head block ~70.96M on 18 September |
| Architecture | Migrated from Polygon zkEVM to the **OP Stack** in October 2025. EVM equivalent |
| Gas token | OKB. Transactions are roughly $0.0005 |
| Explorer | OKLink, `https://www.oklink.com/x-layer` |
| Log queries | The public RPCs **refuse wide `eth_getLogs` ranges**: measured 23 Sep, the cap is **100 blocks** ("block range greater than 100 max") on both `rpc.xlayer.tech` and `xlayerrpc.okx.com`, and dRPC's free tier behaves the same. The indexer pages in 100-block windows |
| Rate limit | Measured 23 Sep from the server: about **2.5 reads a second** per address. 12 of 80 back-to-back log reads came back HTTP 429, JSON-RPC `-32016` "over rate limit"; the other two endpoints throttle the same way. Anything that reads the chain per page view must be cached or rationed |

### Assets on X Layer

| | |
| --- | --- |
| xStocks | Live since June 2026. About **836 tokenized assets, $91.5M market cap**, 88% equities and 12% ETFs. Largest holding MSTRx at about $8.45M |
| Addressable xStocks | **43**, per Swapper's public integration |
| wNVDAx | **Verified on chain** at `0xa8ddb5cd96b5222afe198316e9a57caa642850d5`. Name "Wrapped NVIDIA xStock". Supply grew from 2,501.95 to 2,561.64 tokens during the check, so it is actively being minted |
| USDT (what Warrant pays with) | **USD₮0** `0x779Ded0c9e1022225f8E0630b35a9b54bE713736`: Tether's current token, 106.6M supply on 23 Sep, what OKX Wallet's swap gives. EIP-2612 permit, domain "USD₮0" v1 |
| USDT (the older one) | `0x1E4a5963aBFD975d8c9021ce480b42188849D41d`, "Tether USD", 3.3M supply. Warrant's first deployment used it; a wallet holding it is told to swap |
| Rebasing | On EVM, xStocks handle corporate actions **inside `balanceOf`**. Unlike Solana, no multiplier arithmetic is needed |
| Not verified | Which of the 43 have live on-chain liquidity, and how deep. **This is the first thing to establish.** |

### The OKX DEX aggregator

The route for swapping USDT into an xStock.

- Reachable for chain 196. A quote request returned `{"msg":"Request header OK-ACCESS-KEY can
  not be empty.","code":"50103"}`, which means the request shape was accepted and only
  credentials are missing.
- Requires four headers: `OK-ACCESS-KEY`, `OK-ACCESS-SIGN`, `OK-ACCESS-PASSPHRASE`,
  `OK-ACCESS-TIMESTAMP`.
- The OKX DEX Router is a deployed contract, so the pattern is: fetch calldata from the API
  server side, pass it into the transaction, and have the contract verify the delivered
  amount against a minimum. This mirrors exactly how Scrip verifies a Jupiter fill.

### OKX AI, for context only

Launched July 2026. Over 10,000 agent identities, 4,000 provider listings, 20,000 tasks.
Agent identity is ERC-8004 and lives on X Layer only. It already ships identity, reputation
and reviews, staked Evaluators, dispute resolution, escrow and pay-per-call settlement.

**Read that last sentence before proposing anything in the agent space.** It is why Agent
Forge was rejected.
