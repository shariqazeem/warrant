# Every idea on the table, 18 September 2026

> A review of every OKX Dev Day idea proposed across six models and two days, with what each
> one is, what is good about it, and what kills it. Written so a fresh session can pick up
> without re-running the argument.
>
> Written by the Claude session that built Scrip. Where a fact was verified on chain or on the
> web, it says so. Where something is an opinion, it is marked as one.

---

## Part 1 — The facts, verified

These were checked, not assumed. Two of them contradict things said earlier in the thread.

| Fact | Status |
| --- | --- |
| Stocklana deadline | **25 September, 4:00pm ET**, extended from the 18th. Verified |
| Stocklana pool | $121,000 across the main track plus five sponsor tracks. Verified |
| OKX Dev Day build period | 17 to 25 September, submission 25 September 23:59 UTC. Finalists notified by 30 September. Finale 7 October, Singapore |
| X Layer | Live, chain id 196, RPC `https://rpc.xlayer.tech`, block ~70.96M at time of writing. Verified by direct RPC call |
| xStocks on X Layer | Live since June 2026. 836 tokenized assets, about $91.5M market cap, 88% equities. 43 xStocks addressable |
| wNVDAx on X Layer | **Verified on chain** at `0xa8ddb5cd96b5222afe198316e9a57caa642850d5`. Name "Wrapped NVIDIA xStock". Supply grew from 2,501.95 to 2,561.64 tokens during the check, so it is actively being minted |
| USDT on X Layer | `0x1E4a5963aBFD975d8c9021ce480b42188849D41d`, symbol confirmed |
| OKX DEX aggregator | Reachable for chain 196. Returns `OK-ACCESS-KEY can not be empty` without credentials. **An OKX API key is required and only the founder can create it** |
| OKX AI | Launched July 2026. 10,000+ agent identities, 4,000+ provider listings, 20,000+ tasks. Agent identity is ERC-8004 and lives on X Layer only |
| OKX AI already ships | On-chain identity, reputation and reviews, staked Evaluators, dispute resolution, a task state machine, escrow and pay-per-call. Read from OKX's own agent skill, not from marketing |

### Sponsor tracks, corrected

Earlier advice in the thread overstated these.

| Track | Prize |
| --- | --- |
| Tessera, pre-IPO | $6,000 |
| Meteora, PreStocks, Clawpump | $5,000 each |
| Pyth | Three months of Pyth Pro access. **Not cash** |

The claim that Tessera disqualifies a PreStocks entry could not be verified. Read both
rulebooks before acting on it.

---

## Part 2 — Every idea, and what kills it

Eight ideas were proposed. They are listed in the order they appeared.

### 1. Comptroller — Claude, another session

**One line.** An agent's payout address gets a treasury rule plus a spend policy: per-task
budget, counterparty allowlist, daily cap, reserve floor. Register it as an ASP on OKX AI.

**Good.** Correct diagnosis that nothing exists after an agent earns. The ASP loop is a real
"Build a Company" fit. Reuses Scrip's sweep engine.

**What kills it.** It is the modal answer. Three other models produced the same product
independently. An operator who wants to limit an agent can also just not fund it.

---

### 2. FLOAT — ChatGPT

**One line.** Operating reserve plus target treasury: idle cash above the reserve buys
xStocks, and stock is sold automatically when the reserve is breached.

**Good.** The clearest articulation of the mechanism, and the audit timeline is a strong
visual. Correctly refuses to become a trading bot.

**What kills it.** Same product as Comptroller with better packaging. Also the reserve-and-top-up
loop is the backwards version of the idea: it holds cash *and* stock, so it pays the spread
without removing the idle balance.

---

### 3. Scrip AI, autonomous RWA treasury — GLM

**One line.** An AI agent reads market data and allocates a treasury across xStocks. The
receipt's reason field is the AI's thesis.

**Good.** The receipt carrying a machine's reasoning is a genuinely nice object.

**What kills it.** This is an AI trading bot. OKX's own Agentic Wallet materials already demo
agents scanning markets and executing trades. It is also the most crowded category in both
hackathons, and it puts a model in charge of money, which is the thing every serious judge in
that room is worried about.

---

### 4. Charter — ChatGPT's second pass, and this session's first answer

**One line.** A financial constitution published on chain: reserve floor, spend caps, approved
counterparties, approved assets. Every action gets a verdict and a receipt, including refusals.

**Good.** "Bounded authority" is the right abstraction, and the denial receipt is a memorable
artifact. This session added a bond posted in tokenized stock, which would have made a
tokenized equity useful as collateral rather than as a trade.

**What kills it.** Two things. It is the modal answer, found by four models from the same
brief, so a meaningful share of other teams will arrive with it. And the present need is small:
agent tasks are cent-sized, and nobody demands a performance bond for a $0.02 API call.

**Standing.** Not dead as a component. It is the correct guardrail *inside* whatever is built.
It is not the hero.

---

### 5. Agent Forge — DeepSeek

**One line.** An on-chain credit and reputation layer for agents: revenue record, stability
score, reputation graph. "10,000 workers and none of them have a résumé."

**Good.** Ambition. Platform thinking rather than app thinking.

**What kills it.** The premise is factually wrong. OKX AI already ships on-chain identity
(ERC-8004), reputation and reviews, staked Evaluators and dispute arbitration, all launched in
July. This proposes building a competitor to the host's core feature in front of the people who
shipped it. Expect "we have that" before the third slide. Additionally, much agent payment runs
through channels and vouchers rather than individual on-chain transfers, so the revenue record
would be incomplete, and scoring 10,000 agents from other people's payment flows is not a
five-day build.

**Verdict.** Rejected outright. This is the only idea in the list that could end a pitch in
the first minute.

---

### 6. Verifier — the other Claude session

**One line.** An agent service that other agents hire to check work before money moves. Built
on the founder's Sage record: 41 payouts, 26 refusals, on mainnet.

**Good.** Uses the founder's genuinely rare asset, a record of *refusing*. No external
dependency. It is an OKX AI service natively, so the integration is not decorative.

**Risk that session named itself.** OKX already has staked Evaluators who arbitrate. A judge
may hear "we have that."

**Standing.** The strongest of the ideas that came from outside this session, and the seed of
the final answer below.

---

### 7. Tender — this session's second answer

**One line.** An autonomous business holds no cash. It holds tokenized stock and pays each
bill by selling exactly enough at the moment of payment.

**Good.** It addresses the real present-tense problem in OKX's RWA push, which is that $91.5M
of tokenized assets sit idle with no use but trading. "Asset-based payment or commerce
experiences" is quoted verbatim from OKX's own track description. The demo shows something
that is impossible today.

**What kills it.** Economics, not plumbing. Selling forty cents of a thinly traded tokenized
equity costs gas plus spread plus slippage. On a micro-invoice you spend more making the
payment than the idle cash was ever costing you. It only makes sense on large bills, and large
bills are not what agents pay. At human scale it stops being an agent product and becomes
"spend from your portfolio", which is a Stocklana consumer category, not an OKX AI story.

**Standing.** Withdrawn. The idea is sound at a scale the agent economy has not reached.

---

### 8. Assay — this session's final answer

**One line.** An assay office tested metal before it could be accepted as money. Assay tests an
agent's deliverable before the escrow releases, and before the buyer's model reads it.

**The gap it fills.** Agent deliverables are consumed by machines. A buyer agent cannot look at
the work and tell whether it is good. So it accepts blind and pays for garbage, or it disputes,
which is slow and human. And one failure mode nobody else in this thread mentioned: a
deliverable that another agent will *read* is an attack surface. Hidden instructions inside the
work can hijack the buyer.

**What it does**, called per task over x402 by the buyer agent:

- **Does the work match the spec.** Deterministic checks first, judgment second.
- **Is it real.** Plagiarism, fabricated evidence, wallet farms caught by an on-chain funding graph.
- **Is it safe to read.** Instructions aimed at the reader, flagged before the buyer's model sees them.

Every verdict is a receipt on X Layer carrying its evidence. Pass and the escrow releases. Fail
and it holds, with the reason.

**Why it survives the objections that killed the others.**

| Objection | Answer |
| --- | --- |
| "We already built that" | Evaluators arbitrate a dispute after damage. Assay screens every task before payment, so the dispute never starts |
| "Every model suggests it" | None of the six did. It is not the modal answer |
| "It is an LLM wrapper" | Deterministic checks run first, every verdict is a receipt with evidence, and there is a mainnet record of refusing |
| "It needs liquidity or a partner" | It depends on nothing outside the founder's own machine |

**The demo.** A buyer agent is about to accept. Assay flags a hidden instruction inside the
deliverable telling the reader to redirect funds. Escrow holds. The receipt prints the
evidence.

**The line.** Everyone is building agents that earn. This is the office that tests the work
before the money moves.

**Track.** OKX AI, "Build a Company". X Layer carries the verdict receipts, which is a real but
secondary integration. Do not split focus by chasing both tracks.

**Honest risks.** The Evaluator overlap must be answered in the first thirty seconds of the
pitch, not defended later. And the deterministic layer must be real, or it reads as a wrapper.

---

## Part 3 — How the recommendation moved, and why

This session changed its answer twice. That churn was costly and it is worth recording why,
so nobody reopens it.

| Answer | Killed by |
| --- | --- |
| Charter | It is the modal LLM answer, and the present need is cent-sized |
| Tender | The economics of selling a thin asset to pay a small bill |
| Assay | No kill condition found yet. This is the final answer |

The general lesson: each idea died to a test, not to a preference. Charter died to counting how
many models produced it. Tender died to arithmetic on spread versus idle yield. If Assay is to
die, it will be to the Evaluator overlap, and that is answerable with words rather than with a
rebuild.

---

## Part 4 — Scrip, before mainnet

Scrip is the larger prize and it is nearly finished. Do these before spending an hour on
Singapore. They are in priority order.

1. **Deploy today or tomorrow, not the 21st.** Keep-rate matures at 7 days and it is the number
   Scrip's own front page says decides everything. Deploy on the 18th and that figure exists on
   the 25th when a judge looks. Deploy on the 21st and it reads as a dash at submission. This
   corrects earlier advice from this session, which was given before the deadline moved.
2. **Sponsor the float.** Turning the rule on costs a user SOL they may not have. The relayer
   already pays fees for claims. Extend it to cover the float and the register's rent for the
   first registers, so turning the rule on costs a signature and nothing else. This decides
   whether fifteen real people turn it on or three.
3. **Buy the paid RPC before anyone visits.** Measured 3 to 20 seconds per page on the public
   endpoint from the VM. A judge bounces.
4. **Add an evidence page.** Each of the seven firsts with its mainnet signature, clickable
   through to Solscan. A judge verifies in sixty seconds instead of taking it on trust.
5. **Narrow the front door to one wedge.** The brief says pick one. Lead with the arrival and
   move the seven firsts to the company page.
6. **Change "income becomes ownership" to "income becomes a stock position."** xStocks give
   economic exposure, not shareholder rights. One honest word removes an easy objection.
7. **Fund both keepers and the float on mainnet** before any demo, or the trick fails live.
8. **Real users.** Freelancers paid in USDC who cannot open a US brokerage account. This is the
   founder's unfair advantage and no team in San Francisco has it.

---

## Part 5 — What a new session needs to know

- The Scrip repository is at `/Users/macbookair/projects/webgold`. Its state document is
  `docs/state-of-scrip.md`, the plan it reports on is `docs/SCRIP-COMPANY-PLAN.md`, and the
  design system is `.claude/skills/scrip-ui/SKILL.md`.
- What carries over to an OKX build: the design system, the stub at five sizes, the receipt
  page, the tape, the indexer pattern, and the discipline that every money moment prints a
  receipt. Not the Anchor program.
- The first blocking dependency for anything on X Layer is an OKX developer API key. The
  aggregator refuses without it.
- Before building, re-read Part 2 item 5 so nobody rebuilds Agent Forge by another name.
