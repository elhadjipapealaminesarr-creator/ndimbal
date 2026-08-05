const { expect } = require("chai");
const { ethers, fhevm } = require("hardhat");

// NDIMBAL — capacity / HCU proof at MAX_PARTICIPANTS (32).
//   npx hardhat test test/capacity-32.test.js
//
// The Season-4 plan's "prochain pas concret": fill the pool to the cap and verify the WHOLE lifecycle
// (deposit -> fundPrize -> draw -> claim -> claimSponsored) completes without reverting at 32 savers —
// i.e. the two O(n) FHE loops in draw() and the O(n) sponsorship loop + 2 FHE.div in claim() all fit
// inside a single transaction's op budget when the pool is full.
//
// IMPORTANT: this runs on the fhEVM MOCK, which does not enforce Sepolia's exact HCU ceiling. Green here
// proves FUNCTIONAL correctness and exercises the full 32-wide op count; the DEFINITIVE HCU proof is a
// full round at 32 on the LIVE Sepolia contract (10-min rounds), replayable by the jury.

const ROUND = 3600, LOCK = 60, MAX = 32;

async function enc(addr, signer, v) {
  const i = await fhevm.createEncryptedInput(addr, signer.address).add64(BigInt(v)).encrypt();
  return { handle: i.handles[0], proof: i.inputProof };
}
async function encTwo(addr, signer, a, b) {
  const i = await fhevm.createEncryptedInput(addr, signer.address).add64(BigInt(a)).add64(BigInt(b)).encrypt();
  return { h0: i.handles[0], h1: i.handles[1], proof: i.inputProof };
}

describe("NDIMBAL — capacity at MAX_PARTICIPANTS (32)", function () {
  this.timeout(0); // filling 32 slots on the FHE mock is heavy — no per-test timeout

  it("survives a FULL round at 32 savers (deposit → fundPrize → draw → claim → claimSponsored, no revert)", async function () {
    const signers = await ethers.getSigners();
    expect(signers.length, "need 32 savers + 1 sponsor — set networks.hardhat.accounts.count >= 33").to.be.greaterThanOrEqual(MAX + 1);
    const deployer = signers[0];
    const savers = signers.slice(1, 1 + MAX); // exactly 32 distinct savers

    const token = await (await ethers.getContractFactory("MockNdimbalToken")).deploy();
    await token.waitForDeployment();
    const tokenAddr = await token.getAddress();
    const pool = await (await ethers.getContractFactory("NdimbalPool")).deploy(tokenAddr, ROUND, LOCK, MAX);
    await pool.waitForDeployment();
    const poolAddr = await pool.getAddress();

    // Fill the pool to the cap: mint + approve + deposit for all 32 savers (varied balances).
    for (let k = 0; k < savers.length; k++) {
      const w = savers[k];
      const m = await enc(tokenAddr, w, 1_000_000);
      await token.connect(w).mint(w.address, m.handle, m.proof);
      await token.connect(w).setOperator(poolAddr, 2n ** 47n);
      const d = await enc(poolAddr, w, 100 + k * 10);
      await pool.connect(w).deposit(d.handle, d.proof);
    }
    expect(await pool.participantCount()).to.equal(BigInt(MAX)); // pool is FULL at 32

    // Exercise the two most expensive claim() paths so the op count is worst-case:
    //  - "Tanti caché": saver[0] routes 25% of a win to member #3 (index 2) → the O(n) credit loop runs.
    //  - give-back: saver[1] pledges 40% → the community FHE.div path runs.
    const s = await encTwo(poolAddr, savers[0], 3, 25);
    await pool.connect(savers[0]).setSponsorship(s.h0, s.h1, s.proof);
    const g = await enc(poolAddr, savers[1], 40);
    await pool.connect(savers[1]).setGiveBack(g.handle, g.proof);

    // Fund the prize (sponsor / yield source).
    const m2 = await enc(tokenAddr, deployer, 1_000_000);
    await token.connect(deployer).mint(deployer.address, m2.handle, m2.proof);
    await token.connect(deployer).setOperator(poolAddr, 2n ** 47n);
    const f = await enc(poolAddr, deployer, 10_000);
    await pool.connect(deployer).fundPrize(f.handle, f.proof);

    // DRAW at 32 — two O(32) FHE loops (weighted tickets + running max, then win-flag + snapshot). No revert.
    await ethers.provider.send("evm_increaseTime", [ROUND + 1]);
    await ethers.provider.send("evm_mine", []);
    await expect(pool.draw()).to.not.be.reverted;

    // Exactly one winner across the full pool.
    let winners = 0;
    for (const w of savers) {
      if (await fhevm.userDecryptEbool(await pool.didWin(0, w.address), poolAddr, w)) winners++;
    }
    expect(winners, "exactly one winner at capacity").to.equal(1);

    // Every one of the 32 claims runs the O(32) sponsorship loop + 2 FHE.div — none may revert at capacity.
    for (const w of savers) {
      await expect(pool.connect(w).claim(0)).to.not.be.reverted;
    }
    // The sponsored beneficiary (member #3) withdraws routed winnings — no revert.
    await expect(pool.connect(savers[2]).claimSponsored()).to.not.be.reverted;
  });
});
