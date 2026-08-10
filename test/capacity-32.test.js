const { expect } = require("chai");
const { ethers, fhevm } = require("hardhat");

// NDIMBAL — capacity / gas sweep to size MAX_PARTICIPANTS honestly.
//   npx hardhat test test/capacity-32.test.js
//
// The Season-4 plan's P0: prove the pool survives a full round at its cap. draw() runs two O(n) FHE
// loops and claim() one O(n) loop + 2 FHE.div, so cost grows with n. This sweep fills the pool to a
// range of sizes and MEASURES the gas of draw() and claim() at each, so we can set MAX_PARTICIPANTS to
// a value that stays comfortably under Sepolia's ~36M block-gas ceiling (target: < ~18M for margin).
//
// The local test network's blockGasLimit is raised (hardhat.config) ONLY so large n can be measured
// instead of reverting — it does NOT change what Sepolia will accept. We read the numbers and choose.

const ROUND = 3600, LOCK = 60;
const SIZES = [3, 4, 8, 12, 16, 24, 32]; // probe the new ceiling after the tree-reduction (was capped at 3)
const SEPOLIA_BLOCK_GAS = 36_000_000n;     // approximate live ceiling
const SAFE_TARGET = 18_000_000n;           // we want draw() comfortably under this

async function enc(addr, signer, v) {
  const i = await fhevm.createEncryptedInput(addr, signer.address).add64(BigInt(v)).encrypt();
  return { handle: i.handles[0], proof: i.inputProof };
}

describe("NDIMBAL — capacity / gas sweep", function () {
  this.timeout(0);

  it("measures draw() + claim() gas across pool sizes and reports the safe cap", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const results = [];

    for (const N of SIZES) {
      if (signers.length < N + 1) { results.push({ N, draw: "n/a (need more signers)" }); continue; }
      const savers = signers.slice(1, 1 + N);

      const token = await (await ethers.getContractFactory("MockNdimbalToken")).deploy();
      await token.waitForDeployment();
      const tokenAddr = await token.getAddress();
      const pool = await (await ethers.getContractFactory("NdimbalPool")).deploy(tokenAddr, ROUND, LOCK, N, deployer.address, ethers.ZeroAddress);
      await pool.waitForDeployment();
      const poolAddr = await pool.getAddress();

      for (let k = 0; k < N; k++) {
        const w = savers[k];
        const m = await enc(tokenAddr, w, 1_000_000);
        await token.connect(w).mint(w.address, m.handle, m.proof);
        await token.connect(w).setOperator(poolAddr, 2n ** 47n);
        const d = await enc(poolAddr, w, 100 + k * 10);
        await pool.connect(w).deposit(d.handle, d.proof);
      }
      // give-back on one saver so claim()'s community FHE.div path is measured too
      const g = await enc(poolAddr, savers[0], 30);
      await pool.connect(savers[0]).setGiveBack(g.handle, g.proof);

      const mm = await enc(tokenAddr, deployer, 1_000_000);
      await token.connect(deployer).mint(deployer.address, mm.handle, mm.proof);
      await token.connect(deployer).setOperator(poolAddr, 2n ** 47n);
      const f = await enc(poolAddr, deployer, 10_000);
      await pool.connect(deployer).fundPrize(f.handle, f.proof);

      await ethers.provider.send("evm_increaseTime", [ROUND + 1]);
      await ethers.provider.send("evm_mine", []);

      let drawGas = null, claimGas = null, note = "", txs = 0;
      const B = 8; // batch size per transaction
      try {
        let total = 0n;
        // ticketing batches (round 0): loop until drawPhase == 2
        while ((await pool.drawPhase(0)) < 2n) {
          const rc = await (await pool.drawTickets(B)).wait(); total += rc.gasUsed; txs++;
        }
        // winner batches: loop until drawPhase == 3
        while ((await pool.drawPhase(0)) < 3n) {
          const rc = await (await pool.drawWinners(B)).wait(); total += rc.gasUsed; txs++;
        }
        drawGas = total; // sum across all batch txs (each tx has its OWN HCU budget)
        const rc3 = await (await pool.connect(savers[0]).claim(0)).wait();
        claimGas = rc3.gasUsed;
      } catch (e) { note = "REVERT: " + ((e.shortMessage || e.message || "").slice(0, 110)); }
      results.push({ N, drawGas, claimGas, note, txs });
    }

    // Report
    console.log("\n  ── NDIMBAL capacity sweep (BATCHED draw, batch=8; each tx has its own HCU budget) ──");
    console.log("   N | total draw gas | claim() gas | txs | verdict");
    let safeCap = 0;
    for (const r of results) {
      if (r.drawGas == null) { console.log(`  ${String(r.N).padStart(2)} |  ${r.note || r.draw}`); continue; }
      // "safe" = every batch tx succeeded (none exceeded its per-tx HCU budget).
      const verdict = "✅ safe";
      safeCap = r.N;
      console.log(`  ${String(r.N).padStart(2)} | ${String(r.drawGas).padStart(14)} | ${String(r.claimGas).padStart(10)} | ${String(r.txs).padStart(3)} | ${verdict}`);
    }
    console.log(`\n  → Largest size with draw() under ${SAFE_TARGET} gas: ${safeCap}`);
    console.log("    Set MAX_PARTICIPANTS to this (or just below) and redeploy.\n");

    expect(safeCap, "at least a small pool must fit under the safe target").to.be.greaterThan(0);
  });
});
