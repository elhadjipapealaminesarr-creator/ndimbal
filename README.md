# NDIMBAL — the no-loss prize-savings pool where winning lifts the whole community, *privately*

[![Zama fhEVM](https://img.shields.io/badge/Zama-fhEVM-0E5A4A)](https://docs.zama.ai/fhevm)
[![Season 4](https://img.shields.io/badge/Zama%20Developer%20Program-Mainnet%20Season%204-E4A24C)](https://www.zama.org/post/zama-developer-program-mainnet-season-4)
[![License: BSD-3-Clause-Clear](https://img.shields.io/badge/License-BSD--3--Clause--Clear-blue)](./LICENSE)
[![Network: Sepolia](https://img.shields.io/badge/Network-Sepolia-627EEA)](https://sepolia.etherscan.io)
[![Fairness (simulated)](https://github.com/elhadjipapealaminesarr-creator/ndimbal/actions/workflows/fairness.yml/badge.svg)](./FAIRNESS_LOG.md)

**A confidential PoolTogether built on Zama fhEVM.** Savers deposit a confidential token
(ERC-7984, e.g. cUSDT), **keep their principal (withdraw any time — no loss)**, and a periodic
draw awards the yield-funded prize to one saver.

> *NDIMBAL means "mutual aid" in Wolof.* What makes it unique, and **only possible with FHE**:
> each saver privately pre-sets what share of a win they'd give back to a community fund — so
> **generosity happens with zero social pressure**, and a lottery becomes mutual aid.

**▶ Live demo (nothing to install):** **https://raw.githack.com/elhadjipapealaminesarr-creator/ndimbal/main/demo.html** — bilingual (EN/FR), animated. Or open [`demo.html`](./demo.html) locally.

> **Honest design note, up front:** the draw uses a fully-encrypted **weighted argmax**
> (`ticket = balance × protocol-random`), so odds *strictly increase* with your deposit while the
> pool total never leaks. This is intentionally **not** an *exactly-proportional* `P = balance/total`
> draw — that would require revealing the aggregate total on-chain, which needs a decryption oracle
> not yet in `@fhevm/solidity` 0.11.1. We chose maximum privacy for v1; an exact-proportional mode
> is on the roadmap. (Details in "The confidential draw" below.)

### What stays visible vs. what stays encrypted

| 🔓 Public (on-chain, by design) | 🔒 Encrypted (never revealed) |
|---|---|
| That a round happened, and that it had **exactly one winner** | Every saver's **deposit / balance** |
| The **number of participants** | The **pool total** and the **prize amount** |
| The **aggregate** community fund once swept to a cause | Each saver's **ticket** in the draw |
| Contract code + every transaction (verifiable on Etherscan) | **Who won** (only the winner can decrypt their own flag) |
| — | Each saver's **private give-back %** |

---

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
| Yield distributed via **periodic prize draws** | `fundPrize` receives the yield each round; `draw()` runs once per round window. |
| **Withdraw principal at any time** (no loss) | `withdraw()` is always allowed and clamps to your balance — your deposit is never at risk. |
| Winner selection **over encrypted balances** | `ticket = balance × protocol-random`; the winner is the **encrypted argmax**. Odds strictly rise with the deposit; no balance, total or ticket is ever revealed. |
| **Only winners decrypt** their prize | Each saver receives an encrypted "did I win?" flag `FHE.allow`'d to them alone. |
| Draw stays **verifiable on-chain** | Randomness is **protocol-provided** (`FHE.randEuint32` — unbiasable, un-grindable by the operator); the selection circuit is deterministic and fully on-chain. |
| Deploy to **Sepolia**, production quality | Hardhat project, reentrancy-guarded, anti-snipe deposit lock, one-draw-per-round, tests green. |

## The confidential draw, explained

1. Every round, for each saver: `ticket = balance × FHE.randEuint32()` (all encrypted).
2. The winner is the **encrypted argmax** of the tickets — computed with `FHE.max` + `FHE.eq`.
3. Each saver gets an encrypted `won` flag they alone can decrypt (`FHE.allow`). The operator can
   neither see the tickets nor influence the randomness, so **re-running the draw can't help them**
   grind a winner.
4. The prize is assigned to the (encrypted) winner; on `claim`, the saver's **private give-back %**
   is applied on encrypted values — their share to them, the rest to the encrypted community fund.

**Design note (honest):** the argmax draw makes odds *strictly increase* with the deposit while
keeping the total secret. An *exactly-proportional* draw (`P = balance / total`) requires revealing
the aggregate total on-chain, which needs an on-chain decryption oracle not yet in
`@fhevm/solidity` 0.11.1. When that lands, NDIMBAL can offer an "exact-proportional" mode (reveal
total only). We chose maximum privacy for v1.

## Verify the fairness yourself

A harness runs many encrypted draws and, decrypting **only each saver's own win flag** (exactly
what a real wallet sees), shows that (1) every round has exactly one winner and (2) bigger deposits
win more often — while no balance, total or ticket is ever revealed:

```bash
npm run verify:draw          # or: ROUNDS=120 npx hardhat test test/verify-draw.test.js
```

This same harness runs automatically twice a day via a [GitHub Action](./.github/workflows/fairness.yml),
which appends each result to [`FAIRNESS_LOG.md`](./FAIRNESS_LOG.md) and drives the *Fairness* badge above.
It runs **only on simulated accounts** — it never reads or publishes any real depositor's balance,
ticket, or the real pool total.

## Contracts (`contracts/`)

| File | Role |
|---|---|
| **NdimbalPool.sol** | The pool: confidential deposits, no-loss withdraw, the encrypted weighted draw, winner-only reveal, private solidarity dial, anonymous sponsorship ("Tanti caché"), community fund. |
| **INdimbalToken.sol** | Minimal ERC-7984 surface (operator transfers take an already-imported `euint64`). |
| **mocks/MockNdimbalToken.sol** | Test-only confidential token (cUSDT stand-in). |

## Build, test, deploy

```bash
npm install
npx hardhat compile
npx hardhat test test/NdimbalPool.test.js     # 18 passing
npm run verify:draw                            # fairness harness (optional, great for reviewers)
cp .env.example .env                           # then fill in PRIVATE_KEY, RPC, ETHERSCAN_API_KEY
npx hardhat run scripts/deploy.js --network sepolia
```

The deploy script prints the two `npx hardhat verify` commands for Etherscan source verification.

**Security posture:** `nonReentrant` on all token-touching functions, anti-snipe deposit lock
(`lockWindow`), one draw per round (`drawn[round]`), balance-clamped withdrawals, and give-back % + sponsorship snapshotted at draw (no post-win front-running). Ticket math uses
`euint64` (`balance × randEuint32`) — widen to `euint128` for very large pools.

## Deployed (Sepolia)

| Contract | Address |
|---|---|
| **NdimbalPool** | [`0x49295aF16723bb49CEd8E9B82b53d6E653a18625`](https://sepolia.etherscan.io/address/0x49295aF16723bb49CEd8E9B82b53d6E653a18625) |
| Confidential token (demo cUSDT) | [`0xFE75E3396035670e88Ca1DD9c80AFCBdd785fF80`](https://sepolia.etherscan.io/address/0xFE75E3396035670e88Ca1DD9c80AFCBdd785fF80) |

Deployer: [`0x012d7E6280fF0A77f46E5a4155C614e8dF68E7A2`](https://sepolia.etherscan.io/address/0x012d7E6280fF0A77f46E5a4155C614e8dF68E7A2).

## Roadmap to production

- Route `fundPrize` from a real yield source (ERC-4626 / Morpho vault).
- Exact-proportional draw mode once an on-chain decryption oracle is available.
- Confidential sponsor matching with a public "impact receipt".
- Encrypted pity-timer (rising odds for the patient).

## Author

**El Hadji Pape Alamine Sarr** — Dakar, Senegal — elhadjipapealaminesarr@gmail.com
Part of the **Kaddu** family of confidential civic tools. License: BSD-3-Clause-Clear.
