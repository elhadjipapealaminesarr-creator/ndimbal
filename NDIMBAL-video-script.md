# 🎬 NDIMBAL — Pitch video script (Zama Developer Program, Season 4)

**Target length:** ~2 min 30 (max 3 min). **Language:** English voiceover (international jury) — a French version is easy to swap in.
**Tone:** confident, warm, concrete. Show the *live* dApp doing *real* on-chain things — never a mockup.

**Setup before recording**
- Browser at **https://ndimbal-rho.vercel.app**, MetaMask on **Sepolia**, wallet already funded with a little test-ETH and demo cUSDT (do a Mint + Allow pool + Deposit **before** recording so the demo is fast).
- A second tab open on the verified contract on Etherscan.
- Screen clean, zoom ~110%, activity log popup ready to open.
- Record 1080p, cursor visible.

---

## SCENE 1 — Hook (0:00 – 0:20)
**On screen:** the NDIMBAL hero — animated pot, "Save without loss. Win prizes. Lift your community."
**Voiceover:**
> "This is NDIMBAL — a savings pool where you can win a prize every round, and never lose your deposit. It's a tontine, the way millions save across West Africa… but reinvented on-chain, and completely private. Balances, the draw, even your generosity — all encrypted."

## SCENE 2 — The problem / the FHE insight (0:20 – 0:45)
**On screen:** scroll slowly through "What is NDIMBAL?" and "How it works" (1 → Encrypt, 2 → Compute on ciphertext, 3 → Only you decrypt).
**Voiceover:**
> "On a normal blockchain, everything is public — your balance, who won, how much you gave. That kills privacy, and it kills honest generosity, because people give to be seen. NDIMBAL runs on Zama's fhEVM: the smart contract computes directly on **encrypted** data. Nobody — not even the operator — sees the numbers."

## SCENE 3 — Deposit, live (0:45 – 1:10)
**On screen:** Step 2. Type an amount, click **Deposit**. Open the activity log popup: show "🔒 encrypting in your browser…" → "tx sent" → "✅ CONFIRMED". Hover the Etherscan link.
**Voiceover:**
> "Let's play a real round — these are live transactions on Sepolia. I deposit… and watch: the amount is encrypted **in my browser** before it ever leaves. It's a real confidential transaction, confirmed on-chain. And it's no-loss — I can withdraw my principal at any time."

## SCENE 4 — The unique angle: private generosity + Tanti caché (1:10 – 1:45)
**On screen:** Step 3 (solidarity dial) — drag the slider. Then Step 4 (**Tanti caché**) — enter a member number and a %.
**Voiceover:**
> "Here's what only confidential computing makes possible. First, a private solidarity dial: if I win, I secretly pre-decide how much I give back to the community — no social pressure, just my real choice, encrypted. And **Tanti caché** — a hidden benefactor: I can quietly send part of my prize to a specific member if I win. Nobody learns who gave, to whom, or how much. That's mutual aid — made private."

## SCENE 5 — The draw & the reveal (1:45 – 2:10)
**On screen:** Step 6 — click **Run the draw**, wait for confirm. Then Step 7 — **Authorize decryption** (sign), click **decrypt** on "Did I win?" → shows **1 / won**, then decrypt "My balance in the pool" → still intact.
**Voiceover:**
> "The draw runs on encrypted balances — bigger deposit, better odds — using protocol randomness the operator can't game. Even the pool total never leaks. And the result? Only **I** can decrypt whether I won. There it is — I won. My deposit? Still fully mine. No loss."

## SCENE 6 — Proof + close (2:10 – 2:30)
**On screen:** scroll to the animated "Not a mockup — it lives on-chain" band → click through to Etherscan (verified contract). End on the NDIMBAL logo.
**Voiceover:**
> "This isn't a demo video trick — the contract is deployed and source-verified on Sepolia, and every action you saw is a real transaction you can inspect. NDIMBAL: no-loss savings, real prizes, and private generosity — powered by Zama fhEVM. Thank you."

---

## Quick shot list (for editing)
1. Hero animation (2–3 s hold)
2. Scroll: What is NDIMBAL → How it works
3. Deposit → activity log confirming
4. Solidarity dial slider → Tanti caché inputs
5. Run draw → confirm
6. Authorize → decrypt "Did I win? = 1" → decrypt pool balance (intact)
7. Proof band → Etherscan verified contract → logo end card

## Optional on-screen captions (burn-in)
- "Encrypted in your browser 🔒"
- "Real transaction · Sepolia"
- "No-loss — withdraw any time"
- "Tanti caché — private generosity, FHE-only"
- "Only the winner can decrypt"
- "Deployed & source-verified on-chain"

## Links to show / put in description
- Live dApp: https://ndimbal-rho.vercel.app
- Repo: https://github.com/elhadjipapealaminesarr-creator/ndimbal
- Verified contract: https://sepolia.etherscan.io/address/0x0814191C0cD9B7151437c515ac3618363D8a248b

---
*El Hadji Pape Alamine Sarr — Dakar. NDIMBAL, part of the Kaddu family of confidential civic tools.*
