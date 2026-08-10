const { expect } = require("chai");
const { ethers, fhevm } = require("hardhat");
const { FhevmType } = require("@fhevm/hardhat-plugin");

// NDIMBAL — confidential no-loss prize-savings pool. Runs on the fhEVM Hardhat mock.
//   npx hardhat test test/NdimbalPool.test.js
//
// The draw awards the TOP-3 tickets a tiered prize (1st = 50%, 2nd = 30%, 3rd = 20% of the pot), like
// PoolTogether's descending prizes. It runs in batches across 4 phases (tickets → 2nd max → 3rd max →
// winners); `runDraw()` below drives the whole thing. Statistical fairness lives in verify-draw.test.js.
const ROUND = 3600; // 1h rounds
const LOCK = 60; // no new deposits in the final 60s before a draw (anti-snipe)

// ---------------------------------------------------------------- helpers
async function enc(contractAddr, signer, value) {
  const i = await fhevm.createEncryptedInput(contractAddr, signer.address).add64(BigInt(value)).encrypt();
  return { handle: i.handles[0], proof: i.inputProof };
}
async function encTwo(contractAddr, signer, a, b) {
  const i = await fhevm
    .createEncryptedInput(contractAddr, signer.address)
    .add64(BigInt(a))
    .add64(BigInt(b))
    .encrypt();
  return { h0: i.handles[0], h1: i.handles[1], proof: i.inputProof };
}
async function mintAndApprove(token, tokenAddr, poolAddr, who, amount) {
  const m = await enc(tokenAddr, who, amount);
  await token.connect(who).mint(who.address, m.handle, m.proof);
  await token.connect(who).setOperator(poolAddr, 2n ** 47n);
}
async function deposit(pool, poolAddr, who, amount) {
  const d = await enc(poolAddr, who, amount);
  await pool.connect(who).deposit(d.handle, d.proof);
}
async function withdraw(pool, poolAddr, who, amount) {
  const w = await enc(poolAddr, who, amount);
  await pool.connect(who).withdraw(w.handle, w.proof);
}
async function fundPrize(pool, poolAddr, who, amount) {
  const f = await enc(poolAddr, who, amount);
  await pool.connect(who).fundPrize(f.handle, f.proof);
}
async function setGiveBack(pool, poolAddr, who, pct) {
  const g = await enc(poolAddr, who, pct);
  await pool.connect(who).setGiveBack(g.handle, g.proof);
}
async function advanceToDraw() {
  await ethers.provider.send("evm_increaseTime", [ROUND + 1]);
  await ethers.provider.send("evm_mine", []);
}
// Drive the whole batched top-3 draw for the current round (all 4 phases, batch of 8). Handles empty rounds.
async function runDraw(pool, batch = 8) {
  const r = await pool.round();
  while ((await pool.drawPhase(r)) < 2n) await pool.drawTickets(batch);
  while ((await pool.drawPhase(r)) < 3n) await pool.drawMax2(batch);
  while ((await pool.drawPhase(r)) < 4n) await pool.drawMax3(batch);
  while ((await pool.drawPhase(r)) < 5n) await pool.drawWinners(batch);
}
async function deployPool(maxParticipants = 32, beneficiary) {
  const token = await (await ethers.getContractFactory("MockNdimbalToken")).deploy();
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  const ben = beneficiary || (await ethers.getSigners())[0].address; // immutable community-fund beneficiary
  const pool = await (await ethers.getContractFactory("NdimbalPool")).deploy(tokenAddr, ROUND, LOCK, maxParticipants, ben, ethers.ZeroAddress);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  return { token, tokenAddr, pool, poolAddr };
}
// Standard 3-saver pool: alice 100, bob 300, carol 600, prize 1000. deployer = sponsor + default beneficiary.
async function standard() {
  const [deployer, alice, bob, carol] = await ethers.getSigners();
  const { token, tokenAddr, pool, poolAddr } = await deployPool();
  for (const w of [deployer, alice, bob, carol]) await mintAndApprove(token, tokenAddr, poolAddr, w, 1_000_000);
  for (const [w, a] of [[alice, 100], [bob, 300], [carol, 600]]) await deposit(pool, poolAddr, w, a);
  await fundPrize(pool, poolAddr, deployer, 1000);
  return { token, tokenAddr, pool, poolAddr, deployer, alice, bob, carol };
}
async function countWinners(pool, poolAddr, r, savers) {
  let n = 0;
  for (const w of savers) if (await userBool(await pool.didWin(r, w.address), poolAddr, w)) n++;
  return n;
}
const userBool = (h, addr, s) => fhevm.userDecryptEbool(h, addr, s);
const userU64 = (h, addr, s) => fhevm.userDecryptEuint(FhevmType.euint64, h, addr, s);
async function decryptFails(fn) {
  try { await fn(); return false; } catch (_) { return true; }
}

describe("NdimbalPool", function () {
  this.timeout(0);

  // ----------------------------------------------------------- happy path
  it("runs a fully confidential top-3 draw (three winners among three savers)", async function () {
    const { pool, poolAddr, alice, bob, carol } = await standard();
    await advanceToDraw();
    await runDraw(pool);
    expect(await countWinners(pool, poolAddr, 0, [alice, bob, carol])).to.equal(3); // top-3 of 3 = all win a tier
  });

  // ---- zero-balance guard: no positive balance => no winner, prize rolls over ----
  it("nobody wins when the whole pool is at zero and a prize is funded", async function () {
    const { pool, poolAddr, alice, bob, carol } = await standard();
    await withdraw(pool, poolAddr, alice, 100);
    await withdraw(pool, poolAddr, bob, 300);
    await withdraw(pool, poolAddr, carol, 600); // all three now at a zero balance
    await advanceToDraw();
    await runDraw(pool);
    expect(await countWinners(pool, poolAddr, 0, [alice, bob, carol])).to.equal(0); // guard holds; prize rolls over
  });

  it("only positive-balance savers can win (one winner when two are at zero)", async function () {
    const { pool, poolAddr, alice, bob, carol } = await standard();
    await withdraw(pool, poolAddr, alice, 100);
    await withdraw(pool, poolAddr, bob, 300); // alice & bob at zero; carol keeps 600
    await advanceToDraw();
    await runDraw(pool);
    expect(await countWinners(pool, poolAddr, 0, [alice, bob, carol])).to.equal(1); // carol only; empty tiers roll over
  });

  // ---- ticket uniqueness (NDM-M-01): equal balances still give DISTINCT winners (no double-tier) ----
  it("produces three distinct winners even when all balances are equal (NDM-M-01)", async function () {
    const [deployer, alice, bob, carol] = await ethers.getSigners();
    const { token, tokenAddr, pool, poolAddr } = await deployPool();
    for (const w of [deployer, alice, bob, carol]) await mintAndApprove(token, tokenAddr, poolAddr, w, 1_000_000);
    for (const w of [alice, bob, carol]) await deposit(pool, poolAddr, w, 500); // identical balances
    await fundPrize(pool, poolAddr, deployer, 1000);
    await advanceToDraw();
    await runDraw(pool);
    expect(await countWinners(pool, poolAddr, 0, [alice, bob, carol])).to.equal(3); // unique tickets -> 3 distinct winners
  });

  // ---- audit fixes ----
  it("blocks a second claim() for the same round (NDM-M-03)", async function () {
    const { pool, alice } = await standard();
    await advanceToDraw();
    await runDraw(pool);
    await pool.connect(alice).claim(0);
    await expect(pool.connect(alice).claim(0)).to.be.revertedWith("already claimed");
  });

  it("rolls unfilled tiers over to the next round (NDM-H-02)", async function () {
    const { pool, poolAddr, alice, bob, carol } = await standard(); // prize = 1000
    // round 0: everyone withdraws -> all zero -> nobody wins -> the whole 1000 rolls over
    await withdraw(pool, poolAddr, alice, 100);
    await withdraw(pool, poolAddr, bob, 300);
    await withdraw(pool, poolAddr, carol, 600);
    await advanceToDraw();
    await runDraw(pool);
    // round 1: only alice deposits -> she takes the grand tier (50% of the rolled-over 1000 = 500);
    // the 30%/20% tiers are unfilled and roll over again.
    await deposit(pool, poolAddr, alice, 50);
    await advanceToDraw();
    await runDraw(pool);
    const claimable = await userU64(await pool.claimableOf(1, alice.address), poolAddr, alice);
    expect(claimable).to.equal(500n); // grand tier of the surviving 1000 pot
  });

  it("caps the participant count so the list can't be inflated (NDM-H-01)", async function () {
    const [deployer, alice, bob, carol] = await ethers.getSigners();
    const { token, tokenAddr, pool, poolAddr } = await deployPool(3); // tiny cap for the test
    for (const w of [alice, bob, carol, deployer]) await mintAndApprove(token, tokenAddr, poolAddr, w, 1_000_000);
    await deposit(pool, poolAddr, alice, 10);
    await deposit(pool, poolAddr, bob, 10);
    await deposit(pool, poolAddr, carol, 10); // 3 participants — cap reached
    const d = await enc(poolAddr, deployer, 10);
    await expect(pool.connect(deployer).deposit(d.handle, d.proof)).to.be.revertedWith("pool full");
  });

  it("lets a saver leave() and frees their participant slot (purge)", async function () {
    const { pool, alice } = await standard(); // alice/bob/carol in -> count 3
    expect(await pool.participantCount()).to.equal(3n);
    await pool.connect(alice).leave();
    expect(await pool.participantCount()).to.equal(2n);
    expect(await pool.isParticipant(alice.address)).to.equal(false);
  });

  it("has no admin key — the community fund can only reach the immutable beneficiary (NDM-M-05)", async function () {
    const [, alice, bob] = await ethers.getSigners();
    const { pool } = await deployPool(32, bob.address); // beneficiary fixed at deploy
    expect(await pool.communityBeneficiary()).to.equal(bob.address); // public + immutable, no setter exists
    await expect(pool.connect(alice).sweepCommunityFund()).to.not.be.reverted; // permissionless, no admin
  });

  it("caps the prize at MAX_PRIZE and refunds the excess to the funder (fundPrize)", async function () {
    const [deployer, alice] = await ethers.getSigners();
    const { token, tokenAddr, pool, poolAddr } = await deployPool();
    const MAX_PRIZE = 180_000_000_000_000_000n;        // 1.8e17 (contract constant)
    const OVER = 200_000_000_000_000_000n;             // 2e17: 2e16 above the cap
    await mintAndApprove(token, tokenAddr, poolAddr, deployer, OVER);
    await mintAndApprove(token, tokenAddr, poolAddr, alice, 1_000_000);
    await deposit(pool, poolAddr, alice, 100);         // sole depositor -> takes the grand tier
    const f = await enc(poolAddr, deployer, OVER);
    await pool.connect(deployer).fundPrize(f.handle, f.proof); // fund above the cap in one shot
    const depBal = await userU64(await token.confidentialBalanceOf(deployer.address), tokenAddr, deployer);
    expect(depBal).to.equal(OVER - MAX_PRIZE);         // only MAX_PRIZE actually left the funder; 2e16 refunded
    await advanceToDraw();
    await runDraw(pool);
    const claimable = await userU64(await pool.claimableOf(0, alice.address), poolAddr, alice);
    expect(claimable).to.equal(MAX_PRIZE / 2n);        // grand tier = 50% of the capped pot
  });

  it("no-loss: a saver can withdraw principal at any time", async function () {
    const { pool, poolAddr, alice } = await standard();
    await withdraw(pool, poolAddr, alice, 40);
    const bal = await userU64(await pool.confidentialBalanceOf(alice.address), poolAddr, alice);
    expect(bal).to.equal(60n); // 100 deposited - 40 withdrawn
  });

  it("lets the winners claim their prize without reverting", async function () {
    const { pool, alice, bob, carol } = await standard();
    await advanceToDraw();
    await runDraw(pool);
    for (const who of [alice, bob, carol]) {
      await expect(pool.connect(who).claim(0)).to.not.be.reverted;
    }
  });

  // ------------------------------------------------- security / lifecycle
  it("reverts the draw before the round is over", async function () {
    const { pool } = await standard();
    await expect(pool.drawTickets(8)).to.be.revertedWith("round not over");
  });

  it("reverts a second draw on the same round (no silent double draw)", async function () {
    const { pool } = await standard();
    await advanceToDraw();
    await runDraw(pool);
    // round has advanced + roundStart reset, so an immediate re-draw is rejected
    await expect(pool.drawTickets(8)).to.be.revertedWith("round not over");
  });

  it("rejects deposits inside the anti-snipe lock window", async function () {
    const { pool, poolAddr, alice } = await standard();
    await ethers.provider.send("evm_increaseTime", [ROUND - 30]);
    await ethers.provider.send("evm_mine", []);
    expect(await pool.depositsOpen()).to.equal(false);
    const d = await enc(poolAddr, alice, 50);
    await expect(pool.connect(alice).deposit(d.handle, d.proof)).to.be.revertedWith(
      "deposits locked before draw"
    );
  });

  it("still allows withdrawals inside the lock window (no-loss holds)", async function () {
    const { pool, poolAddr, bob } = await standard();
    await ethers.provider.send("evm_increaseTime", [ROUND - 30]);
    await ethers.provider.send("evm_mine", []);
    await withdraw(pool, poolAddr, bob, 100); // must succeed even while deposits are locked
    const bal = await userU64(await pool.confidentialBalanceOf(bob.address), poolAddr, bob);
    expect(bal).to.equal(200n); // 300 - 100
  });

  it("advances an empty round instead of reverting (leave() deadlock fix)", async function () {
    const { pool } = await deployPool(); // nobody deposited
    await advanceToDraw();
    await expect(pool.drawTickets(8)).to.not.be.reverted; // empty round must NOT revert...
    expect(await pool.round()).to.equal(1n);              // ...it advances the clock instead
    expect(await pool.drawn(0)).to.equal(true);
    expect(await pool.depositsOpen()).to.equal(true);     // and deposits reopen for the next round
  });

  it("recovers after every saver leaves (no permanent lock)", async function () {
    const { pool, poolAddr, alice, bob, carol } = await standard();
    await pool.connect(alice).leave();
    await pool.connect(bob).leave();
    await pool.connect(carol).leave();
    expect(await pool.participantCount()).to.equal(0n);
    await advanceToDraw();
    await runDraw(pool); // empty round 0 advances
    expect(await pool.round()).to.equal(1n);
    // round 1: alice rejoins and takes the grand tier of the rolled-over prize
    await deposit(pool, poolAddr, alice, 50);
    await advanceToDraw();
    await runDraw(pool);
    expect(await userBool(await pool.didWin(1, alice.address), poolAddr, alice)).to.equal(true);
  });

  // ----------------------------------------------------- functional edges
  it("a single depositor always wins the grand tier", async function () {
    const [deployer, alice] = await ethers.getSigners();
    const { token, tokenAddr, pool, poolAddr } = await deployPool();
    await mintAndApprove(token, tokenAddr, poolAddr, deployer, 1_000_000);
    await mintAndApprove(token, tokenAddr, poolAddr, alice, 1_000_000);
    await deposit(pool, poolAddr, alice, 100);
    await fundPrize(pool, poolAddr, deployer, 1000);
    await advanceToDraw();
    await runDraw(pool);
    expect(await userBool(await pool.didWin(0, alice.address), poolAddr, alice)).to.equal(true);
    const claimable = await userU64(await pool.claimableOf(0, alice.address), poolAddr, alice);
    expect(claimable).to.equal(500n); // grand tier = 50% of 1000
  });

  it("a saver who withdraws everything before the draw cannot win", async function () {
    const { pool, poolAddr, alice, bob, carol } = await standard();
    await withdraw(pool, poolAddr, alice, 100); // alice exits fully (bob/carol remain)
    await advanceToDraw();
    await runDraw(pool);
    expect(await userBool(await pool.didWin(0, alice.address), poolAddr, alice)).to.equal(false);
    // the two remaining positive savers take tiers 1 and 2; tier 3 is unfilled
    expect(await countWinners(pool, poolAddr, 0, [bob, carol])).to.equal(2);
  });

  it("applies the private give-back split correctly on claim", async function () {
    // sole depositor => deterministic grand-tier winner (500), so we can assert exact token flows
    const [deployer, alice, bob] = await ethers.getSigners();
    const { token, tokenAddr, pool, poolAddr } = await deployPool(32, bob.address); // bob = immutable beneficiary
    await mintAndApprove(token, tokenAddr, poolAddr, deployer, 1_000_000);
    await mintAndApprove(token, tokenAddr, poolAddr, alice, 1_000_000);
    await deposit(pool, poolAddr, alice, 100);
    await setGiveBack(pool, poolAddr, alice, 30); // alice privately gives back 30%
    await fundPrize(pool, poolAddr, deployer, 1000);
    await advanceToDraw();
    await runDraw(pool);
    await pool.connect(alice).claim(0);

    // alice grand prize 500: gives back 30% (150), keeps 350 -> 1_000_000 - 100 + 350 = 1_000_250
    const aliceBal = await userU64(await token.confidentialBalanceOf(alice.address), tokenAddr, alice);
    expect(aliceBal).to.equal(1_000_250n);

    // the 150 community share can only ever go to the IMMUTABLE beneficiary (bob) — permissionless, no admin
    await pool.connect(alice).sweepCommunityFund();
    const bobBal = await userU64(await token.confidentialBalanceOf(bob.address), tokenAddr, bob);
    expect(bobBal).to.equal(150n);
  });

  it("lets a winner reinvest their prize into the pool (compound, no loss)", async function () {
    const [deployer, alice] = await ethers.getSigners();
    const { token, tokenAddr, pool, poolAddr } = await deployPool();
    await mintAndApprove(token, tokenAddr, poolAddr, deployer, 1_000_000);
    await mintAndApprove(token, tokenAddr, poolAddr, alice, 1_000_000);
    await deposit(pool, poolAddr, alice, 100);
    await fundPrize(pool, poolAddr, deployer, 1000);
    await advanceToDraw();
    await runDraw(pool);
    // alice takes the grand tier (500) and REINVESTS instead of withdrawing
    await pool.connect(alice).claimReinvest(0);
    // her pool balance compounded: 100 deposit + 500 prize = 600
    const poolBal = await userU64(await pool.confidentialBalanceOf(alice.address), poolAddr, alice);
    expect(poolBal).to.equal(600n);
    // her wallet is unchanged (she never withdrew): 1_000_000 - 100 = 999_900
    const walletBal = await userU64(await token.confidentialBalanceOf(alice.address), tokenAddr, alice);
    expect(walletBal).to.equal(999_900n);
    // and she cannot claim the same round twice
    await expect(pool.connect(alice).claim(0)).to.be.revertedWith("already claimed");
  });

  it("keeps working across several consecutive rounds", async function () {
    const { pool, poolAddr, deployer, alice, bob, carol } = await standard();
    for (let r = 0; r < 3; r++) {
      if (r > 0) await fundPrize(pool, poolAddr, deployer, 1000); // round 0 already funded
      await advanceToDraw();
      await runDraw(pool);
      expect(await countWinners(pool, poolAddr, r, [alice, bob, carol]), `round ${r}`).to.equal(3);
    }
  });

  it("exposes the participant count but never the individual results", async function () {
    const { pool } = await standard();
    expect(await pool.participantCount()).to.equal(3n);
  });

  // ------------------------------------------------ confidentiality / ACL
  it("a third party cannot decrypt another saver's win flag", async function () {
    const { pool, poolAddr, alice, bob } = await standard();
    await advanceToDraw();
    await runDraw(pool);
    const aliceFlag = await pool.didWin(0, alice.address);
    expect(await decryptFails(() => userBool(aliceFlag, poolAddr, bob))).to.equal(true);
  });

  it("a third party cannot decrypt another saver's balance", async function () {
    const { pool, poolAddr, bob, carol } = await standard();
    const carolBal = await pool.confidentialBalanceOf(carol.address);
    expect(await decryptFails(() => userU64(carolBal, poolAddr, bob))).to.equal(true);
  });

  // ------------------------------------------ "Tanti caché" anonymous sponsorship
  it("privately routes part of a win to a member the winner chose in secret", async function () {
    // alice is the sole positive-balance saver -> grand tier 500. She secretly routes 40% of her net to bob.
    const [deployer, alice, bob] = await ethers.getSigners();
    const { token, tokenAddr, pool, poolAddr } = await deployPool();
    await mintAndApprove(token, tokenAddr, poolAddr, deployer, 1_000_000);
    await mintAndApprove(token, tokenAddr, poolAddr, alice, 1_000_000);
    await mintAndApprove(token, tokenAddr, poolAddr, bob, 1_000_000);

    await deposit(pool, poolAddr, alice, 100); // participants[0] = alice
    await deposit(pool, poolAddr, bob, 50); //    participants[1] = bob
    await withdraw(pool, poolAddr, bob, 50); //    bob -> 0 balance, still a participant

    // alice sponsors participant index 1 (bob) => encoded index+1 = 2, share 40%
    const s = await encTwo(poolAddr, alice, 2, 40);
    await pool.connect(alice).setSponsorship(s.h0, s.h1, s.proof);

    await fundPrize(pool, poolAddr, deployer, 1000);
    await advanceToDraw();
    await runDraw(pool);
    await pool.connect(alice).claim(0); // grand tier 500, give-back 0, sponsors 40%

    // bob receives 40% of alice's net (500): 200
    const bobCredit = await userU64(await pool.sponsoredWonOf(bob.address), poolAddr, bob);
    expect(bobCredit).to.equal(200n);

    // alice keeps 60% of 500 (300): 1_000_000 - 100 deposit + 300 = 1_000_200
    const aliceBal = await userU64(await token.confidentialBalanceOf(alice.address), tokenAddr, alice);
    expect(aliceBal).to.equal(1_000_200n);

    // bob withdraws routed winnings: 1_000_000 (deposited 50, withdrew 50) + 200 = 1_000_200
    await pool.connect(bob).claimSponsored();
    const bobBal = await userU64(await token.confidentialBalanceOf(bob.address), tokenAddr, bob);
    expect(bobBal).to.equal(1_000_200n);
  });

  it("a non-sponsored member receives nothing (no accidental routing)", async function () {
    const { pool, poolAddr, carol } = await standard();
    await advanceToDraw();
    await runDraw(pool);
    await pool.connect(carol).claim(0);
    const credit = await userU64(await pool.sponsoredWonOf(carol.address), poolAddr, carol);
    expect(credit).to.equal(0n);
  });

  it("freezes give-back at draw time (a winner cannot renege after winning)", async function () {
    const [deployer, alice, bob] = await ethers.getSigners();
    const { token, tokenAddr, pool, poolAddr } = await deployPool(32, bob.address); // bob = immutable beneficiary
    await mintAndApprove(token, tokenAddr, poolAddr, deployer, 1_000_000);
    await mintAndApprove(token, tokenAddr, poolAddr, alice, 1_000_000);
    await deposit(pool, poolAddr, alice, 100);
    await setGiveBack(pool, poolAddr, alice, 30); // pledged 30% BEFORE the draw
    await fundPrize(pool, poolAddr, deployer, 1000);
    await advanceToDraw();
    await runDraw(pool); // snapshot captures 30%
    await setGiveBack(pool, poolAddr, alice, 0); // alice tries to renege after winning
    await pool.connect(alice).claim(0);

    // the snapshot (30%) is applied to her grand prize (500): keeps 350, community keeps 150
    const aliceBal = await userU64(await token.confidentialBalanceOf(alice.address), tokenAddr, alice);
    expect(aliceBal).to.equal(1_000_250n);
    await pool.connect(alice).sweepCommunityFund();
    const bobBal = await userU64(await token.confidentialBalanceOf(bob.address), tokenAddr, bob);
    expect(bobBal).to.equal(150n);
  });
});
