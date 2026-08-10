# 🎬 NDIMBAL — Pitch video script (Zama Developer Program, Season 4)

**Primary length: ~90 seconds** (the jury watches many entries — a tight 90s beats a loose 2:30).
**Audience:** someone who has *never heard of FHE*. Lead with the human idea, not the cryptography.
**Thesis to land in the first 10 seconds:** *private generosity* — you can secretly lift up a neighbour, and no one is watching. That's the thing only FHE makes possible; put it **first**, never in a footnote.
**Tone:** warm, confident, concrete. Everything on screen is the *live* dApp doing *real* on-chain things — never a mockup.

**Setup before recording**
- Browser at **https://ndimbal-rho.vercel.app**, MetaMask on **Sepolia**, wallet funded with a little test-ETH + demo cUSDC.
- **Do Mint + Allow pool once before recording** so the live part is fast.
- **Demo solo (one wallet).** A single depositor *always wins* the round — so your "I won" reveal is deterministic and clean, no retries on camera. (The pool's proven capacity is 3 savers/round; solo is perfect for a tight demo.)
- Second tab open on the **verified contract** on Etherscan. Activity-log popup ready. Record 1080p, cursor visible, zoom ~110%.

---

## SCENE 1 — Human hook · lead with generosity (0:00 – 0:12)
**On screen:** the NDIMBAL hero — animated pot, the encrypted "Prize this round 🔒" badge.
**Voiceover:**
> "Imagine a savings pool where nobody ever loses, one member wins a prize each round — and you can quietly send part of your winnings to a neighbour who needs it, with *no one* watching. No names, no pressure, no showing off. That's NDIMBAL."

## SCENE 2 — Why this is impossible without FHE (0:12 – 0:28)
**On screen:** slow scroll through "What is NDIMBAL?" → the 1-2-3 (Encrypt · Compute on ciphertext · Only you decrypt).
**Voiceover:**
> "On a normal blockchain, everything is public — your balance, who won, how much you gave. So generosity becomes performance. NDIMBAL runs on Zama's fhEVM: the contract computes directly on **encrypted** data. Your numbers stay yours — even the operator sees nothing."

## SCENE 3 — Live, no-loss deposit (0:28 – 0:45)
**On screen:** Step 2 — type an amount, click **Deposit**, open the activity log: "🔒 encrypting in your browser…" → "tx sent" → "✅ CONFIRMED".
**Voiceover:**
> "Let's play a real round — a live transaction on Sepolia. I deposit… and the amount is encrypted **in my browser** before it ever leaves. It's confirmed on-chain, and it's no-loss — I can pull my principal out any time."

## SCENE 4 — The headline: private solidarity + Tanti caché (0:45 – 1:08)
**On screen:** Step 3 solidarity dial (drag slider), then Step 4 **Tanti caché** (member #, %).
**Voiceover:**
> "Now the part only confidential computing allows. A private give-back dial: if I win, I pre-decide *in secret* how much goes back to the community — real generosity, zero social pressure. And **Tanti caché**, a hidden benefactor: I quietly route part of my prize to one member. Nobody ever learns who gave, to whom, or how much. Mutual aid — made private."

## SCENE 5 — The draw & the winner-only reveal (1:08 – 1:24)
**On screen:** Step 6 **Run the draw** → confirm. Step 7 **Authorize** (sign) → **decrypt** "Did I win? = 1", then decrypt "My balance" (still intact).
**Voiceover:**
> "The draw runs on encrypted balances — bigger deposit, better odds — with protocol randomness the operator can't game. Even the pool's total never leaks. And only **I** can decrypt whether I won. There — I won. My deposit? Still fully mine."

## SCENE 6 — Proof + close (1:24 – 1:30)
**On screen:** the "Not a mockup — it lives on-chain" band → click to the verified contract on Etherscan → end on the NDIMBAL logo.
**Voiceover:**
> "Deployed and source-verified on Sepolia — every action was a real transaction you can inspect. NDIMBAL: no-loss savings, real prizes, and quiet solidarity — powered by Zama fhEVM."

---

## Quick shot list
1. Hero + encrypted prize badge (2 s hold)
2. Scroll: What is NDIMBAL → 1-2-3
3. Deposit → activity log confirming
4. Solidarity slider → Tanti caché inputs  ← **the money shot; hold on it**
5. Run draw → confirm
6. Authorize → decrypt "Did I win? = 1" → decrypt balance (intact)
7. Proof band → Etherscan verified → logo end card

## Burn-in captions (optional)
- "Encrypted in your browser 🔒"  ·  "Real transaction · Sepolia"  ·  "No-loss — withdraw any time"
- "Tanti caché — private generosity, only possible with FHE"  ·  "Only the winner can decrypt"  ·  "Deployed & source-verified"

## Links (video description)
- Live dApp: https://ndimbal-rho.vercel.app
- Repo: https://github.com/elhadjipapealaminesarr-creator/ndimbal
- Verified contract: https://sepolia.etherscan.io/address/0xf507fAe5cF86C17A085E84C21ba15a42776d5103

---

## Extended 2:30 cut (optional — if you have more time)
Same running order, but stretch: hold the hero longer; in Scene 2 add one line on *why* a public draw "kills honest generosity, because people give to be seen"; in Scene 3 hover the Etherscan tx link to prove it's real; in Scene 5 explain the weighted-argmax in one plain sentence ("odds rise with your deposit, but the total stays secret — a stronger privacy guarantee than a public proportional draw"). Keep the generosity beat (Scene 4) as the emotional centre either way.

---
*El Hadji Pape Alamine Sarr — Dakar. NDIMBAL, part of the Kaddu family of confidential civic tools.*
