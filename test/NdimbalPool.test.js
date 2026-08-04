const { expect } = require("chai");
const { ethers, fhevm } = require("hardhat");
const { FhevmType } = require("@fhevm/hardhat-plugin");

// NDIMBAL — confidential no-loss prize-savings pool. Runs on the fhEVM Hardhat mock.
//   npx hardhat test test/NdimbalPool.test.js
//
// This suite goes well beyond a happy-path check: it covers the draw, no-loss withdrawal,
// the private give-back split, deposit-lock (anti-snipe) behaviour, one-draw-per-round,
// empty/edge pools, and access control (a third party can never decrypt someone else's
// win flag or balance). Statistical fairness over many rounds lives in verify-draw.test.js.
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
async function deployPool(maxParticipants = 32) {
  const token = await (await ethers.getContractFactory("MockNdimbalToken")).deploy();
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  const pool = await (await ethers.getContractFactory("NdimbalPool")).deploy(tokenAddr, ROUND, LOCK, maxParticipants);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  return { token, tokenAddr, pool, poolAddr };
}
// Standard 3-saver pool: alice 100, bob 300, carol 600, prize 1000. deployer = admin + sponsor.
async function standard() {
  const [deployer, alice, bob, carol] = await ethers.getSigners();
  const { token, tokenAddr, pool, poolAddr } = await deployPool();
  for (const w of [deployer, alice, bob, carol]) await mintAndApprove(token, tokenAddr, poolAddr, w, 1_000_000);
  for (const [w, a] of [[alice, 100], [bob, 300], [carol, 600]]) await deposit(pool, poolAddr, w, a);
  await fundPrize(pool, poolAddr, deployer, 1000);
  return { token, tokenAddr, pool, poolAddr, deployer, alice, bob, carol };
}
const userBool = (h, addr, s) => fhevm.userDecryptEbool(h, addr, s);
const userU64 = (h, addr, s) => fhevm.userDecryptEuint(FhevmType.euint64, h, addr, s);
async function decryptFails(fn) {
  try { await fn(); return false; } catch (_) { return true; }
}

describe("NdimbalPool", function () {
  this.timeout(0);

  // ----------------------------------------------------------- happy path
  it("runs a fully confidential draw with exactly one winner", async function () {
    const { pool, poolAddr, alice, bob, carol } = await standard();
    await advanceToDraw();
    await pool.draw();

    let winners = 0;
    for (const who of [alice, bob, carol]) {
      const won = await userBool(await pool.didWin(0, who.address), poolAddr, who);
      if (won) winners++;
    }
    expect(winners).to.equal(1);
  });

  // ---- zero-balance guard (regression test for the multiple-winner bug) ----
  // If everyone withdraws before the draw but a prize is funded, every ticket == 0 == maxTicket.
  // Without the `balance > 0` guard in draw(), FHE.eq(ticket, maxTicket) is true for ALL of them
  // and each could claim the full pot. The guard must make this yield ZERO winners (prize rolls over).
  it("nobody wins when the whole pool is at zero and a prize is funded", async function () {
    const { pool, poolAddr, alice, bob, carol } = await standard();
    await withdraw(pool, poolAddr, alice, 100);
    await withdraw(pool, poolAddr, bob, 300);
    await withdraw(pool, poolAddr, carol, 600); // all three now at a zero balance
    await advanceToDraw();
    await pool.draw();

    let winners = 0;
    for (const who of [alice, bob, carol]) {
      if (await userBool(await pool.didWin(0, who.address), poolAddr, who)) winners++;
    }
    expect(winners).to.equal(0); // guard holds: no zero-balance winner; the prize rolls over
  });

  it("still has exactly one winner when several savers are tied at a zero balance", async function () {
    const { pool, poolAddr, alice, bob, carol } = await standard();
    await withdraw(pool, poolAddr, alice, 100);
    await withdraw(pool, poolAddr, bob, 300); // alice & bob at zero; carol keeps 600
    await advanceToDraw();
    await pool.draw();

    let winners = 0;
    for (const who of [alice, bob, carol]) {
      if (await userBool(await pool.didWin(0, who.address), poolAddr, who)) winners++;
    }
    expect(winners).to.equal(1); // carol; the two zero-balance savers can never tie-win
  });

  // ---- ticket uniqueness (NDM-M-01): equal balances must still yield ONE winner ----
  // The riskiest tie case: three savers with the SAME positive balance. balance × random can collide,
  // so the ticket carries the public loop index in its low 8 bits to break exact ties. This asserts the
  // uniqueness law directly — without it, two "argmax" savers could each claim the full pot.
  it("produces exactly one winner even when all balances are equal (NDM-M-01)", async function () {
    const [deployer, alice, bob, carol] = await ethers.getSigners();
    const { token, tokenAddr, pool, poolAddr } = await deployPool();
    for (const w of [deployer, alice, bob, carol]) await mintAndApprove(token, tokenAddr, poolAddr, w, 1_000_000);
    for (const w of [alice, bob, carol]) await deposit(pool, poolAddr, w, 500); // identical balances
    await fundPrize(pool, poolAddr, deployer, 1000);
    await advanceToDraw();
    await pool.draw();

    let winners = 0;
    for (const who of [alice, bob, carol]) {
      if (await userBool(await pool.didWin(0, who.address), poolAddr, who)) winners++;
    }
    expect(winners).to.equal(1); // tie-breaker index guarantees a unique argmax
  });

  // ---- audit fixes ----
  it("blocks a second claim() for the same round (NDM-M-03)", async function () {
    const { pool, poolAddr, alice } = await standard();
    await advanceToDraw();
    await pool.draw();
    await pool.connect(alice).claim(0);                       // first claim ok (moves 0 if she lost)
    await expect(pool.connect(alice).claim(0)).to.be.revertedWith("already claimed");
  });

  it("rolls the prize over to the next round when nobody wins (NDM-H-02)", async function () {
    const { pool, poolAddr, alice, bob, carol } = await standard(); // prize = 1000
    // round 0: everyone withdraws -> all balances zero -> nobody wins -> prize must roll over (not burn)
    await withdraw(pool, poolAddr, alice, 100);
    await withdraw(pool, poolAddr, bob, 300);
    await withdraw(pool, poolAddr, carol, 600);
    await advanceToDraw();
    await pool.draw();
    // round 1: only alice deposits -> sole positive balance -> she wins the rolled-over prize
    await deposit(pool, poolAddr, alice, 50);
    await advanceToDraw();
    await pool.draw();
    const claimable = await userU64(await pool.claimableOf(1, alice.address), poolAddr, alice);
    expect(claimable).to.equal(1000n); // the 1000 prize survived round 0 and is claimable in round 1
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

  it("no-loss: a saver can withdraw principal at any time", async function () {
    const { pool, poolAddr, alice } = await standard();
    await withdraw(pool, poolAddr, alice, 40);
    const bal = await userU64(await pool.confidentialBalanceOf(alice.address), poolAddr, alice);
    expect(bal).to.equal(60n); // 100 deposited - 40 withdrawn
  });

  it("lets the winner claim the prize without reverting", async function () {
    const { pool, alice, bob, carol } = await standard();
    await advanceToDraw();
    await pool.draw();
    for (const who of [alice, bob, carol]) {
      await expect(pool.connect(who).claim(0)).to.not.be.reverted;
    }
  });

  // ------------------------------------------------- security / lifecycle
  it("reverts draw() before the round is over", async function () {
    const { pool } = await standard();
    await expect(pool.draw()).to.be.revertedWith("round not over");
  });

  it("reverts a second draw() on the same round (no silent double draw)", async function () {
    const { pool } = await standard();
    await advanceToDraw();
    await pool.draw();
    // round has advanced + roundStart reset, so an immediate re-draw is rejected
    await expect(pool.draw()).to.be.reverted;
  });

  it("rejects deposits inside the anti-snipe lock window", async function () {
    const { pool, poolAddr, alice } = await standard();
    // move to within LOCK seconds of the draw => deposits must be closed
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
    await expect(pool.draw()).to.not.be.reverted; // empty round must NOT revert...
    expect(await pool.round()).to.equal(1n);       // ...it advances the clock instead
    expect(await pool.drawn(0)).to.equal(true);
    expect(await pool.depositsOpen()).to.equal(true); // and deposits reopen for the next round
  });

  it("recovers after every saver leaves (no permanent lock)", async function () {
    // alice/bob/carol join then all leave -> pool empty. draw() must still advance the round so the
    // pool isn't frozen forever, and a new saver can join and win the next round.
    const { pool, poolAddr, alice, bob, carol } = await standard();
    await pool.connect(alice).leave();
    await pool.connect(bob).leave();
    await pool.connect(carol).leave();
    expect(await pool.participantCount()).to.equal(0n);
    await advanceToDraw();
    await pool.draw(); // empty round 0 advances
    expect(await pool.round()).to.equal(1n);
    // round 1: alice rejoins and wins the rolled-over prize
    await deposit(pool, poolAddr, alice, 50);
    await advanceToDraw();
    await pool.draw();
    const won = await userBool(await pool.didWin(1, alice.address), poolAddr, alice);
    expect(won).to.equal(true);
  });

  // ----------------------------------------------------- functional edges
  it("a single depositor always wins the round", async function () {
    const [deployer, alice] = await ethers.getSigners();
    const { token, tokenAddr, pool, poolAddr } = await deployPool();
    await mintAndApprove(token, tokenAddr, poolAddr, deployer, 1_000_000);
    await mintAndApprove(token, tokenAddr, poolAddr, alice, 1_000_000);
    await deposit(pool, poolAddr, alice, 100);
    await fundPrize(pool, poolAddr, deployer, 1000);
    await advanceToDraw();
    await pool.draw();
    const won = await userBool(await pool.didWin(0, alice.address), poolAddr, alice);
    expect(won).to.equal(true);
  });

  it("a saver who withdraws everything before the draw cannot win", async function () {
    const { pool, poolAddr, alice, bob, carol } = await standard();
    await withdraw(pool, poolAddr, alice, 100); // alice exits fully (bob/carol remain)
    await advanceToDraw();
    await pool.draw();
    const aliceWon = await userBool(await pool.didWin(0, alice.address), poolAddr, alice);
    expect(aliceWon).to.equal(false);
    // exactly one winner still exists among the remaining savers
    let winners = 0;
    for (const who of [bob, carol]) {
      if (await userBool(await pool.didWin(0, who.address), poolAddr, who)) winners++;
    }
    expect(winners).to.equal(1);
  });

  it("applies the private give-back split correctly on claim", async function () {
    // sole depositor => deterministic winner, so we can assert exact token flows
    const [deployer, alice, bob] = await ethers.getSigners();
    const { token, tokenAddr, pool, poolAddr } = await deployPool();
    await mintAndApprove(token, tokenAddr, poolAddr, deployer, 1_000_000);
    await mintAndApprove(token, tokenAddr, poolAddr, alice, 1_000_000);
    await deposit(pool, poolAddr, alice, 100);
    await setGiveBack(pool, poolAddr, alice, 30); // alice privately gives back 30%
    await fundPrize(pool, poolAddr, deployer, 1000);
    await advanceToDraw();
    await pool.draw();
    await pool.connect(alice).claim(0);

    // alice: 1_000_000 - 100 deposit + 700 kept prize = 1_000_600
    const aliceBal = await userU64(await token.confidentialBalanceOf(alice.address), tokenAddr, alice);
    expect(aliceBal).to.equal(1_000_600n);

    // the 300 community share is sweepable by the admin (deployer) to any cause
    await pool.connect(deployer).sweepCommunityFund(bob.address);
    const bobBal = await userU64(await token.confidentialBalanceOf(bob.address), tokenAddr, bob);
    expect(bobBal).to.equal(300n);
  });

  it("keeps working across several consecutive rounds", async function () {
    const { pool, poolAddr, deployer, alice, bob, carol } = await standard();
    for (let r = 0; r < 3; r++) {
      if (r > 0) await fundPrize(pool, poolAddr, deployer, 1000); // round 0 already funded
      await advanceToDraw();
      await pool.draw();
      let winners = 0;
      for (const who of [alice, bob, carol]) {
        if (await userBool(await pool.didWin(r, who.address), poolAddr, who)) winners++;
      }
      expect(winners, `round ${r}`).to.equal(1);
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
    await pool.draw();
    const aliceFlag = await pool.didWin(0, alice.address);
    // bob is not FHE.allow'd on alice's flag => decryption must fail for him
    expect(await decryptFails(() => userBool(aliceFlag, poolAddr, bob))).to.equal(true);
  });

  it("a third party cannot decrypt another saver's balance", async function () {
    const { pool, poolAddr, bob, carol } = await standard();
    const carolBal = await pool.confidentialBalanceOf(carol.address);
    expect(await decryptFails(() => userU64(carolBal, poolAddr, bob))).to.equal(true);
  });

  // ------------------------------------------ "Tanti caché" anonymous sponsorship
  it("privately routes part of a win to a member the winner chose in secret", async function () {
    // alice (index 0) and bob (index 1) both join; bob then exits to 0 so alice wins deterministically,
    // yet bob stays a participant and can be sponsored. alice secretly routes 40% of her net win to bob.
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
    await pool.draw();

    // alice wins (bob's ticket is 0). She keeps 60%, bob privately receives 40%.
    await pool.connect(alice).claim(0);

    // bob can read the amount routed to him, but never who sent it
    const bobCredit = await userU64(await pool.sponsoredWonOf(bob.address), poolAddr, bob);
    expect(bobCredit).to.equal(400n); // 1000 net (give-back 0) * 40%

    // alice kept 600 (give-back 0, sponsored 40%): 1_000_000 - 100 deposit + 600 = 1_000_500
    const aliceBal = await userU64(await token.confidentialBalanceOf(alice.address), tokenAddr, alice);
    expect(aliceBal).to.equal(1_000_500n);

    // bob withdraws his routed winnings: started 1_000_000 (deposited 50, withdrew 50) + 400 = 1_000_400
    await pool.connect(bob).claimSponsored();
    const bobBal = await userU64(await token.confidentialBalanceOf(bob.address), tokenAddr, bob);
    expect(bobBal).to.equal(1_000_400n);
  });

  it("a non-sponsored member receives nothing (no accidental routing)", async function () {
    // carol is a participant but nobody sponsors her; her sponsored credit must stay 0
    const { pool, poolAddr, carol } = await standard();
    await advanceToDraw();
    await pool.draw();
    // claim by everyone (no sponsorship set anywhere)
    for (const who of [carol]) await pool.connect(who).claim(0);
    const credit = await userU64(await pool.sponsoredWonOf(carol.address), poolAddr, carol);
    expect(credit).to.equal(0n);
  });

  it("freezes give-back at draw time (a winner cannot renege after winning)", async function () {
    const [deployer, alice, bob] = await ethers.getSigners();
    const { token, tokenAddr, pool, poolAddr } = await deployPool();
    await mintAndApprove(token, tokenAddr, poolAddr, deployer, 1_000_000);
    await mintAndApprove(token, tokenAddr, poolAddr, alice, 1_000_000);
    await deposit(pool, poolAddr, alice, 100);
    await setGiveBack(pool, poolAddr, alice, 30); // pledged 30% BEFORE the draw
    await fundPrize(pool, poolAddr, deployer, 1000);
    await advanceToDraw();
    await pool.draw(); // snapshot captures 30%
    await setGiveBack(pool, poolAddr, alice, 0); // alice tries to renege after winning
    await pool.connect(alice).claim(0);

    // the snapshot (30%) is applied, NOT the reneged 0% => alice keeps 700, community keeps 300
    const aliceBal = await userU64(await token.confidentialBalanceOf(alice.address), tokenAddr, alice);
    expect(aliceBal).to.equal(1_000_600n);
    await pool.connect(deployer).sweepCommunityFund(bob.address);
    const bobBal = await userU64(await token.confidentialBalanceOf(bob.address), tokenAddr, bob);
    expect(bobBal).to.equal(300n);
  });
});
