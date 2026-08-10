# NDIMBAL — the no-loss prize-savings pool where winning lifts the whole community, *privately*

[![Zama fhEVM](https://img.shields.io/badge/Zama-fhEVM-0E5A4A)](https://docs.zama.ai/fhevm)
[![Season 4](https://img.shields.io/badge/Zama%20Developer%20Program-Mainnet%20Season%204-E4A24C)](https://www.zama.org/post/zama-developer-program-mainnet-season-4)
[![License: BSD-3-Clause-Clear](https://img.shields.io/badge/License-BSD--3--Clause--Clear-blue)](./LICENSE)
[![Network: Sepolia](https://img.shields.io/badge/Network-Sepolia-627EEA)](https://sepolia.etherscan.io)
[![Fairness (simulated)](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/workflows/fairness.yml/badge.svg)](./FAIRNESS_LOG.md)

**A confidential PoolTogether built on Zama fhEVM.** Savers deposit a confidential token
(ERC-7984, e.g. cUSDC), **keep their principal (withdraw any time — no loss)**, and a periodic
draw awards the yield-funded prize to the **top-3 savers** (tiered **50 / 30 / 20**).

> *NDIMBAL means "mutual aid" in Wolof.* What makes it unique, and **only possible with FHE**:
> each saver privately pre-sets what share of a win they'd give back to a community fund — so
> **generosity happens with zero social pressure**, and a lottery becomes mutual aid.

**▶ Live dApp — real on-chain transactions:** **https://ndimbal-rho.vercel.app** — connect MetaMask on Sepolia, mint demo tokens, deposit (encrypted in your browser), run the confidential top-3 draw, then **claim or reinvest** and **decrypt your own result** — nobody else can read it. A guided **4-stage** walkthrough (Start · Save & play · Prize engine · Draw & win) explains every step.

**▶ Animated overview / explainer (nothing to install):** **https://elhadjipapealaminesarr-creator.github.io/ndimbal/** — bilingual (EN/FR), animated marketing walkthrough. Or open [`index.html`](./index.html) locally.

> **Design choice, up front — privacy over proportionality:** the draw is a fully-encrypted
> **weighted argmax** (`ticket = balance × protocol-random`). Odds *strictly increase* with your deposit,
> and — unlike a proportional `P = balance/total` draw — **even the pool's total never leaks**. That is the
> stronger guarantee: proportionality *requires* revealing the aggregate total on-chain, so NDIMBAL keeps it
> encrypted by design. Maximal privacy is the whole reason to build this on FHE, not a shortcut around it.
> The exact weighting is measured and published below; a proportional mode is an *opt-in* on the roadmap,
> not a missing feature. (Details in "The confidential draw".)

### What stays visible vs. what stays encrypted

| 🔓 Public (on-chain, by design) | 🔒 Encrypted (never revealed) |
|---|---|
| That a round happened, and that it had **exactly three winners** (top-3) | Every saver's **deposit / balance** |
| The **number of participants** | The **pool total** and each **prize amount** |
| The **aggregate** community fund once swept to a cause | Each saver's **ticket** in the draw |
| Contract code + every transaction (verifiable on Etherscan) | **Who won** (only each winner can decrypt their own flag) |
| — | Each saver's **private give-back %** |

---

## The live dApp — play a full confidential round

A production-quality React dApp (Vite + the Zama Relayer SDK) drives the deployed contract on
Sepolia end-to-end — **real transactions, encrypted in your browser, decrypted only by you**.
Live at **https://ndimbal-rho.vercel.app** (source: [`ndimbal-dapp`](https://github.com/elhadjipapealaminesarr-creator/ndimbal-dapp)).

A guided **4-stage** flow lets anyone play a full round — only **Stage 2 (deposit)** is required; everything else is optional:

1. **Start** — mint demo cUSDC and authorize the pool (first time only).
2. **Save & play** *(required)* — deposit; your amount is FHE-encrypted client-side, withdraw any time (no loss). Collapsible **advanced options**: the *solidarity dial* (privately pre-set what share of a win you'd give back), *Tanti caché* (secretly route a share of your prize to a chosen member if you win — nobody learns who, to whom, or how much), and *sponsor the prize* (top up the pot blindly).
3. **The prize engine** — route confidential capital into a Morpho-style yield vault and **harvest only the yield** into the pot (the prize funds itself).
4. **Draw & win** — countdown → run the confidential **top-3** draw (tiered 50/30/20) → decrypt *did I win?* (a value only you can read), then **Claim** your prize *or* **Reinvest & compound** it straight back into the pool (no-loss, better next-round odds); claim any sponsored winnings too.

Everything runs against the deployed on-chain contract; the app never sees a plaintext balance.
COOP/COEP headers enable the FHE WebAssembly runtime.

## Why this wins: the FHE-only insight

On a normal chain, on-chain generosity is public → people give to be *seen* (social-desirability
bias). By **encrypting the choice to give**, NDIMBAL captures people's *true* prosocial preference
at scale, and routes it to a verifiable community fund without exposing any individual's generosity.
This behavioural primitive is **impossible without confidential computation** — exactly what Zama is
built to showcase. And the draw itself is the most private a PoolTogether can be: **even the pool's
total never leaks.**

## How NDIMBAL meets every Season-4 requirement

| Requirement (bounty) | How NDIMBAL delivers |
|---|---|
| Deposits, balances, winnings **encrypted** | Balances are FHE ciphertexts (`euint64`); settlement in a confidential ERC-7984 token. |
| Yield distributed via **periodic prize draws** | **Real yield**: `fundVault` routes capital into a confidential Morpho vault; `harvestYield` skims only the earned yield into the pot each round; `draw()` awards it. (A manual `fundPrize` sponsor path also remains.) |
| **Withdraw principal at any time** (no loss) | `withdraw()` is always allowed and clamps to your balance — your deposit is never at risk. |
| Winner selection **over encrypted balances** | `ticket = min(balance, 2³⁹) × protocol-random`; the **top-3** tickets win (encrypted masked-argmax, three passes). Odds strictly rise with the deposit; no balance, total or ticket is ever revealed. |
| **Only winners decrypt** their prize | Each saver receives an encrypted "did I win?" flag `FHE.allow`'d to them alone. |
| Draw stays **verifiable on-chain** | Randomness is **protocol-provided** (`FHE.randEuint16` — unbiasable, un-grindable by the operator); the selection circuit is deterministic and fully on-chain. |
| Deploy to **Sepolia**, production quality | Hardhat project, reentrancy-guarded, anti-snipe deposit lock, one-draw-per-round, **batched draw scaling to 32 savers**, tests green. |

## The confidential draw, explained

1. Every round, for each saver: `ticket = min(balance, 2³⁹) × FHE.randEuint16()`, kept in `euint64`
   and made unique via an index tiebreak (`ticket = (ticket << 8) | position`) — all encrypted.
2. The **top-3** tickets win. The draw runs a masked encrypted argmax in phases (`drawTickets` →
   `drawMax2` → `drawMax3` → `drawWinners`): find the max, mask it out, find the 2nd, mask it out, find
   the 3rd — each computed with `FHE.max` + `FHE.eq`, all on ciphertext.
3. Each saver gets an encrypted `won` flag they alone can decrypt (`FHE.allow`). The operator can
   neither see the tickets nor influence the randomness, so **re-running the draw can't help them**
   grind a winner.
4. Prizes are tiered **50 / 30 / 20** (`pot × tier% / 100`); if a tier is unfilled it **rolls over**
   into the remaining pot. On `claim`, the saver's **private give-back %** is applied on encrypted
   values — their share to them, the rest to the encrypted community fund. A winner may instead
   **`claimReinvest`** to compound the prize straight back into their pool balance (no-loss).
5. A **zero-balance guard** ensures a saver who withdrew everything (but is still listed in
   `participants[]`) can never win: `won = eq(ticket, maxTicket) AND balance > 0`. Unique tickets mean
   no two savers ever tie, so each round produces **exactly three winners** — or fewer paid tiers if the
   pool is smaller, with the unpaid tiers rolling over. (Regression-tested; see the zero-balance and
   batched-draw tests.)

**Winner selection is verifiable on-chain — only the winners' identities are not.** This is a deliberate
step *beyond* the brief's "verifiable" requirement: the selection circuit and the protocol randomness
(`FHE.randEuint16`, un-grindable by the operator) run entirely on-chain, so anyone can audit that the
draw is deterministic and that **exactly three winners** are produced per round. What stays private is only
*who* they are — each saver decrypts their own flag, nobody else's. Verifiable process, private outcome.

**The draw is weighted, not linearly proportional — by design, for privacy.** The argmax of
`balance × random` makes odds rise with the deposit, but **not linearly**. The numbers below characterise the
**top ticket** (the tier-1 winner) — the same weighted-argmax the top-3 draw runs three times, masking out each
winner before finding the next. For two savers with balances `b₁ ≤ b₂`, the single-winner law is
**P(b₁ wins) = (b₁ / b₂) / 2**, which under-weights small savers relative to a proportional draw. We measure and
publish that distortion rather than round it away — over 400,000 simulated single-winner draws per configuration:

| Pool | Balance | Proportional share | Actual odds (tier-1) | Ratio |
|---|---|---|---|---|
| 100 / 300 / 600 | 100 | 10.0% | 1.9% | 0.19× |
| 100 / 300 / 600 | 300 | 30.0% | 24.2% | 0.80× |
| 100 / 300 / 600 | 600 | 60.0% | 74.0% | 1.23× |

The **top-3** draw awards the three highest tickets (tiers 50/30/20). It uses the exact same weighted mechanism —
bigger deposits land in the top-3 more often — so the privacy argument below is unchanged.

A proportional `P = balance / total` draw is **not "more correct" — it is less private**: it requires the
aggregate **total** to be revealed on-chain (a decryption oracle not in `@fhevm/solidity` 0.11.1). NDIMBAL
keeps the total encrypted, which is the stronger guarantee and the entire reason to use FHE here. The
weighting is the deliberate price of that privacy, published in full above. A proportional mode
(cumulative-threshold circuit, or a total-reveal oracle) remains an **opt-in on the roadmap** for pools that
would trade total-privacy for linearity — a choice, not a fix.

## Verify the fairness yourself

A harness runs many encrypted draws and, decrypting **only each saver's own win flag** (exactly
what a real wallet sees), shows that (1) every round has exactly **three** winners (the top-3) and (2) bigger
deposits land in the top-3 more often — while no balance, total or ticket is ever revealed:

```bash
npm run verify:draw          # or: ROUNDS=120 npx hardhat test test/verify-draw.test.js
```

This same harness runs automatically twice a day via a [GitHub Action](./.github/workflows/fairness.yml),
which appends each result to [`FAIRNESS_LOG.md`](./FAIRNESS_LOG.md) and drives the *Fairness* badge above.
It runs **only on simulated accounts** — it never reads or publishes any real depositor's balance,
ticket, or the real pool total.

**Scope of the harness (honest):** it verifies *exactly-three-winners* and *odds rise with the deposit* — it does
**not** test the *shape* of the distribution, so on its own it cannot detect the weighting quantified in the
design note above. A chi-square goodness-of-fit test against the target law is on the roadmap.

## Contracts (`contracts/`)

| File | Role |
|---|---|
| **NdimbalPool.sol** | The pool: confidential deposits, no-loss withdraw, the encrypted **top-3** weighted draw (batched to 32 savers), tiered 50/30/20 prizes, `claim`/`claimReinvest`, winner-only reveal, private solidarity dial, anonymous sponsorship ("Tanti caché"), real-yield loop (`fundVault`/`harvestYield`), community fund. |
| **INdimbalToken.sol** | Minimal ERC-7984 surface (operator transfers take an already-imported `euint64`). |
| **IConfidentialVault.sol** | Vault-agnostic adapter (`asset`/`deposit`/`redeem`/`confidentialBalanceOf`) — points at the real Morpho vault on mainnet, the mock on Sepolia. |
| **mocks/MockNdimbalToken.sol** | Test-only confidential token (cUSDC stand-in). |
| **mocks/MockConfidentialVault.sol** | Sepolia stand-in for the Steakhouse Confidential Prime USDC vault (simulated yield via `accrue`). |

## Build, test, deploy

```bash
npm install
npx hardhat compile
npx hardhat test                               # full suite — green (pool, batched draw, yield, capacity, fairness)
npm run verify:draw                            # fairness harness (optional, great for reviewers)
cp .env.example .env                           # then fill in PRIVATE_KEY, RPC, ETHERSCAN_API_KEY
npx hardhat run scripts/deploy-ndimbal-demo.js --network sepolia
```

The deploy script prints the three `npx hardhat verify` commands (token, vault, pool) for Etherscan source verification.

**Security posture:** `nonReentrant` on all token-touching functions, anti-snipe deposit lock
(`lockWindow`), one draw per round (`drawn[round]`), balance-clamped withdrawals, give-back % + sponsorship snapshotted at draw (no post-win front-running), a **zero-balance guard** so an emptied account can never win, a **participant cap** plus a voluntary **`leave()`** purge against draw-DoS, **strictly-unique tickets** so two savers can never tie-win (no-loss holds), a **prize cap + rollover** (no overflow, and a no-winner round never burns the pot), a **double-claim lock**, and a **`private`** `claimed` flag. These harden findings from an **independent security review**: every item affecting **saver principal or draw availability** is fixed with regression tests. The community fund now routes only to an **immutable beneficiary** (no admin key). The remaining review items are **deliberate v1 trade-offs, documented honestly below** — chiefly the winner's metadata-level (not cryptographic) linkability. Ticket math stays in
`euint64` (`min(balance, 2³⁹) × randEuint16`, then an 8-bit index tiebreak) — overflow-safe and uniqueness-guaranteed, while keeping every draw transaction under the fhEVM HCU budget.

## Real yield — the prize is *generated*, not injected (Morpho)

The Season-4 brief asks for a prize funded by **real yield on the deposited capital**, not a number a sponsor
types into `fundPrize()`. NDIMBAL routes confidential capital through a **confidential yield vault** and skims
**only the yield** into each round's prize — the principal stays invested and nothing ever leaks:

- `fundVault(encAmount, proof)` places confidential capital into the vault and tracks the encrypted principal.
- `harvestYield()` computes `yield = vaultPosition − principal` and moves **only that** into `_prizePot`.
  It is **permissionless** (the destination is the prize pot, not a choice), never touches principal, and if the
  vault ever *lost* value (`position < principal`) the yield is exactly **zero** — an encrypted `select`, no
  underflow. Same overflow-safe cap as `fundPrize`.
- The vault is reached through a small `IConfidentialVault` interface, so the pool is **vault-agnostic**.

**Infrastructure research (mainnet vs testnet — verified, not assumed).** Zama's real confidential yield venue,
the **Steakhouse Confidential Prime USDC vault on Morpho**, and the real **cUSDC** (`0xe978…72B2`) are **Ethereum
mainnet only** — there is *no* confidential yield vault on Sepolia today. Sepolia *does* have ERC-7984 confidential
tokens (e.g. Cipherproof's cUSDC, Riser's wrappers). So NDIMBAL ships, on the bounty's Sepolia target, a
[`MockConfidentialVault`](./contracts/mocks/MockConfidentialVault.sol) that mirrors the real vault's surface with
**simulated** yield; in production the **same** `IConfidentialVault` adapter points at the real mainnet vault —
**one constructor address, zero NDIMBAL code change**. Proven end-to-end by
[`test/NdimbalYield.test.js`](./test/NdimbalYield.test.js) (fund → yield → harvest → draw → the winner's prize *is*
the yield) and [`test/MockConfidentialVault.test.js`](./test/MockConfidentialVault.test.js).

> *One-line pitch:* the principal never moves (no-loss), but the yield that grows it comes from a real DeFi
> strategy — confidential end-to-end, like the rest of the pool.

## Known limits (documented on purpose)

Rather than let a reviewer find these, here they are up front — none is a security hole, each has a
clear v1 rationale:

- **Participant count is capped at `MAX_PARTICIPANTS = 32` — reached by batching the draw across
  transactions.** A single-transaction draw hits the fhEVM's per-transaction **circuit-depth** limit
  (`HCUTransactionDepthLimitExceeded`) at just n = 4. NDIMBAL removes that ceiling three ways, all shipped:
  **(1)** the max/argmax reductions are **tree-reduced** (O(log n) depth, not O(n)); **(2)** ticket and draw
  math stays in **`euint64`** (half the per-op HCU of `euint128`); and **(3)** the draw is **split into four
  phases** (`drawTickets → drawMax2 → drawMax3 → drawWinners`), each processing savers in **batches of 8**
  across separate transactions, so no single tx exceeds the total-HCU budget. Profiled directly on the fhEVM
  (see [`test/capacity-32.test.js`](./test/capacity-32.test.js)): the batched draw is safe from 3 to **32**
  savers per round — and the test now **asserts** the full 32-saver round completes every phase (it no longer
  merely reports the largest working size, so a future regression that broke 32 would fail loudly). The cap is
  an immutable constructor parameter. Going beyond 32 is a matter of more
  batches / a higher cap at deploy, or an off-chain-decryption argmax — on the roadmap. Savers can `leave()`
  to free a slot; a **stake-to-join** deterrent against dust slot-squatting is also on the roadmap. Note:
  `leave()` reindexes `participants[]` (swap-pop). The draw iterates the **frozen snapshot** `_participantsAt[r]`
  (never the live array), so a `leave()`/`withdraw()` *during* a multi-tx draw cannot desync it or brick a later
  phase — the whole draw is resumable and self-consistent (regression-tested in
  [`test/NdimbalAbandonedDraw.test.js`](./test/NdimbalAbandonedDraw.test.js)). Because the draw
  **freezes the participant list per round** (`_participantsAt[r]`), a `leave()` *after* a draw can no longer
  **redirect** a "Tanti caché" credit to whoever got swapped into that slot — `claim()` pays out against the
  frozen list. A `leave()` *before* the draw can still shift positions, so a sponsorship set by index may
  then land on a different member (best-effort, re-settable until the draw). A per-address (not per-index)
  encoding closes that pre-draw window too and is on the roadmap.
- **The draw snapshots the participant list (NDM-L-05, storage cost).** Freezing `participants` into
  `_participantsAt[r]` at each draw copies up to `MAX_PARTICIPANTS` (≤ 32) addresses to storage — cheap per
  round, but the per-round snapshots are never purged, so contract storage grows one small array per round.
  This is the price of closing the draw→claim sponsorship-redirect window. A roadmap fix stores only a
  `keccak256(participants)` per round (one slot) and has
  `claim(r, address[] calldata snapshot)` verify the hash — O(1) storage and calldata iteration — but it
  changes the `claim` signature, so it is deferred to a post-hackathon version.
- **The community fund goes to an immutable beneficiary — no admin key (was NDM-M-05, now fixed).**
  `sweepCommunityFund()` takes no `to` and has no `admin` check: it routes the aggregate fund only to
  `communityBeneficiary`, an `immutable` address fixed at deploy that no function can change. The call is
  deliberately **permissionless** — anyone may trigger it, because the destination is not a choice, so it
  can never be used to divert funds. This removes the contract's only centralised trust point (the earlier
  single-admin, unconstrained-`to` sweep). Pointing the beneficiary at a Gnosis Safe or DAO at deploy time
  is a config choice, not a code change.
- **The draw needs a trigger.** The batched draw (`drawTickets → drawMax2 → drawMax3 → drawWinners`) is
  permissionless — anyone can push it forward once the round ends, so the operator can't game it — but if
  nobody runs it, deposits stay locked until it completes. It is **resumable**: each phase continues from its
  own on-chain cursor (`ticketDone`/`mask2Done`/`mask3Done`/`winDone`), so a draw abandoned or interrupted
  mid-way is simply picked up by the next call — no state is lost and it can never deadlock. Production would
  add a keeper (Chainlink Automation or similar); for the demo, evaluators trigger it themselves.
- **The sponsorship index isn't validated.** A "Tanti caché" beneficiary index pointing at no real
  participant simply routes nothing (the amount returns to the winner via the encrypted maths).
  Validating it on-chain would require revealing the chosen index, which would defeat the sponsorship's
  privacy — so this trade-off is intentional.
- **A `rand16 == 0` ticket collapses to its tiebreak (negligible, ~1/65536).** A ticket is
  `min(balance, 2³⁹) × randEuint16`, then `<< 8 | (n − i)` so every ticket is unique (no two savers can
  tie, which is what keeps the top-3 well-formed and no-loss intact). The one imperfection: if the protocol
  random draws exactly `0` for a saver (probability 1/65536 per saver per round), their ticket collapses to
  just the tiebreak `(n − i)`, so they almost certainly lose that round — a fairness penalty *beyond* the
  intended weighting. It is left as-is on purpose: the probability is negligible and the obvious mitigation
  (`rand + 1`, so the multiplier is never 0) adds an `FHE.add` per saver in the **tightest** phase
  (`drawTickets`), eating into the batched draw's HCU headroom. Documented, measured (see the capacity
  sweep), and deprioritised — not silently ignored.
- **Give-back / sponsorship math is euint64 — and the prize is capped to keep it safe.** `c × pct / 100`
  stays in euint64 (like the ticket math; widening either to euint128 pushes the draw/`claim()` past the
  fhEVM HCU budget). To make that *enforced* rather than merely assumed, `fundPrize` **clamps the pot** with `FHE.min`
  to `MAX_PRIZE = 1.8×10¹⁷`, so `c × pct` can never overflow euint64. Any amount funded above the ceiling is
  **refunded to the funder** in the same call (`excess = newPot − capped`, transferred back) — never silently
  absorbed by the contract. That ceiling is orders of magnitude above any realistic cUSDC prize.
- **The winners are private cryptographically, but not against metadata.** Only the top-3 winners are
  incentivised to call the (expensive, O(n)) `claim()`/`claimReinvest`, so an observer of the public
  transaction history can infer them with high confidence — the win *flag* itself stays encrypted; the leak
  is behavioural. (The `claimed`
  bookkeeping is `private`, so it adds no extra on-chain "who claimed" signal.) Crediting the prize at draw
  time to a claimable balance — making claims indistinguishable between winners and losers — is on the roadmap.

## Deployed (Sepolia)

| Contract | Address | Notes |
|---|---|---|
| **NdimbalPool** (live · audit-hardened · source-verified) | [`0xF23D0c33c76266484087C3805b54a8Ca5d9F6960`](https://sepolia.etherscan.io/address/0xF23D0c33c76266484087C3805b54a8Ca5d9F6960#code) | Powers the hosted dApp · all audit fixes · **real-yield loop** (`fundVault`/`harvestYield`) · **batched draw — up to 32 savers/round** · **top-3 tiered prizes 50/30/20** (PoolTogether-style) · **`claimReinvest` (compound)** · immutable community beneficiary — no admin key |
| **MockConfidentialVault** (yield source) | [`0x4D22EC727D7Ab715531BBEfc55BFEA3BdAF250C7`](https://sepolia.etherscan.io/address/0x4D22EC727D7Ab715531BBEfc55BFEA3BdAF250C7) | Sepolia stand-in for the Steakhouse Confidential Prime USDC vault on Morpho; production points at the real mainnet vault via the same interface |
| Confidential token (demo cUSDC) | [`0xe98b1DDd5F51342b3048a3A51A758996bCdCE976`](https://sepolia.etherscan.io/address/0xe98b1DDd5F51342b3048a3A51A758996bCdCE976) | ERC-7984 stand-in for the pool above |

Deployer: [`0x012d7E6280fF0A77f46E5a4155C614e8dF68E7A2`](https://sepolia.etherscan.io/address/0x012d7E6280fF0A77f46E5a4155C614e8dF68E7A2).

## Roadmap to production

- Point the `IConfidentialVault` adapter at the **real** Steakhouse Confidential Prime USDC vault on mainnet (the confidential yield loop already ships against the Sepolia mock — one constructor address, zero code change).
- A **keeper** (Chainlink Automation) to trigger the draw automatically once a round ends.
- Exact-proportional draw mode once an on-chain decryption oracle is available.
- Confidential sponsor matching with a public "impact receipt".
- Encrypted pity-timer (rising odds for the patient).

## Author

**El Hadji Pape Alamine Sarr** — Dakar, Senegal — elhadjipapealaminesarr@gmail.com
Part of the **Kaddu** family of confidential civic tools. License: BSD-3-Clause-Clear.
