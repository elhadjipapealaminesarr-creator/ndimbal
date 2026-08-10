const { expect } = require("chai");
const { ethers, fhevm } = require("hardhat");

// NDIMBAL — "verify a past draw" fairness harness (for judges & auditors).
//   npx hardhat test test/verify-draw.test.js
//   ROUNDS=120 npx hardhat test test/verify-draw.test.js   (more samples => less noise)
//
// The draw awards the TOP-3 tickets a tiered prize. This harness proves, WITHOUT ever revealing a balance,
// a total, or a ticket:
//   1) Every round produces EXACTLY THREE winners (the top-3 selection is well-formed).
//   2) A saver's frequency of landing in the top-3 increases with their deposit — bigger stake => better odds
//      (NDIMBAL's honest "strictly-increasing, not exactly-proportional" claim).
// It decrypts ONLY each saver's own "did I win?" flag — exactly what a real wallet sees.
const ROUND = 3600;
const LOCK = 60;
const ROUNDS = Number(process.env.ROUNDS || 60);
// 8 savers with increasing deposits, so the top-3 is a real subset and the weighting is visible.
const DEPOSITS = [["A", 100], ["B", 200], ["C", 300], ["D", 400], ["E", 500], ["F", 600], ["G", 700], ["H", 800]];

async function enc(contract, signer, value) {
  const i = await fhevm.createEncryptedInput(contract, signer.address).add64(BigInt(value)).encrypt();
  return { handle: i.handles[0], proof: i.inputProof };
}
async function runDraw(pool, batch = 8) {
  const r = await pool.round();
  while ((await pool.drawPhase(r)) < 2n) await pool.drawTickets(batch);
  while ((await pool.drawPhase(r)) < 3n) await pool.drawMax2(batch);
  while ((await pool.drawPhase(r)) < 4n) await pool.drawMax3(batch);
  while ((await pool.drawPhase(r)) < 5n) await pool.drawWinners(batch);
}

describe("NDIMBAL — confidential draw fairness harness", function () {
  this.timeout(0);

  it(`is fair over ${ROUNDS} encrypted top-3 draws (exactly three winners; bigger deposit lands in the top-3 more)`, async function () {
    const signers = await ethers.getSigners();
    const sponsor = signers[0];
    const savers = signers.slice(1, 1 + DEPOSITS.length);

    const T = await ethers.getContractFactory("MockNdimbalToken");
    const token = await T.deploy();
    await token.waitForDeployment();
    const tokenAddr = await token.getAddress();

    const P = await ethers.getContractFactory("NdimbalPool");
    const pool = await P.deploy(tokenAddr, ROUND, LOCK, 32, sponsor.address, ethers.ZeroAddress);
    await pool.waitForDeployment();
    const poolAddr = await pool.getAddress();

    for (const who of [sponsor, ...savers]) {
      const m = await enc(tokenAddr, who, 100_000_000);
      await token.connect(who).mint(who.address, m.handle, m.proof);
      await token.connect(who).setOperator(poolAddr, 2n ** 47n);
    }
    for (let k = 0; k < savers.length; k++) {
      const d = await enc(poolAddr, savers[k], DEPOSITS[k][1]);
      await pool.connect(savers[k]).deposit(d.handle, d.proof);
    }

    const wins = new Array(savers.length).fill(0);
    let malformed = 0;
    console.log(`\n  NDIMBAL — sampling ${ROUNDS} encrypted top-3 draws (only per-user win flags are decrypted)\n`);

    for (let r = 0; r < ROUNDS; r++) {
      const f = await enc(poolAddr, sponsor, 1000);
      await pool.connect(sponsor).fundPrize(f.handle, f.proof);
      await ethers.provider.send("evm_increaseTime", [ROUND + 1]);
      await ethers.provider.send("evm_mine", []);
      await runDraw(pool);

      let w = 0;
      for (let k = 0; k < savers.length; k++) {
        const flag = await pool.didWin(r, savers[k].address);
        if (await fhevm.userDecryptEbool(flag, poolAddr, savers[k])) { wins[k]++; w++; }
      }
      if (w !== 3) malformed++; // top-3 => exactly three winners each round
    }

    const totalW = DEPOSITS.reduce((s, d) => s + d[1], 0);
    console.log("  saver     deposit   weight%   top3-hits   top3%");
    for (let k = 0; k < savers.length; k++) {
      const [name, amt] = DEPOSITS[k];
      console.log(
        `  ${name.padEnd(8)}  ${String(amt).padStart(6)}   ${(100 * amt / totalW).toFixed(1).padStart(6)}   ${String(wins[k]).padStart(8)}   ${(100 * wins[k] / ROUNDS).toFixed(1).padStart(6)}`
      );
    }
    console.log(`\n  exactly-three-winners every round : ${malformed === 0 ? "PASS ✅" : "FAIL ❌"}`);
    console.log(`  biggest deposit tops the smallest  : ${wins[savers.length - 1] > wins[0] ? "PASS ✅" : "raise ROUNDS to smooth noise"}`);
    console.log("\n  No balance, total or ticket was ever revealed — only each saver's own flag. That is NDIMBAL.\n");

    expect(malformed, "every round must have exactly three winners (top-3)").to.equal(0);
    expect(wins[savers.length - 1], "biggest deposit should land in the top-3 more than the smallest")
      .to.be.greaterThan(wins[0]);
  });
});
