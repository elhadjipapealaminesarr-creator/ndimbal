const { expect } = require("chai");
const { ethers, fhevm } = require("hardhat");

// NDIMBAL — the BATCHED draw is correct at scale, not just non-reverting.
//   npx hardhat test test/NdimbalBatchedDraw.test.js
// Fills the pool to 32 savers and runs the draw in batches of 8 (drawTickets ×4, drawWinners ×4). The
// cross-batch running max + running "anyWon" must still yield EXACTLY ONE winner, and that winner must be
// able to claim. This exercises the state that persists between the batch transactions.

const ROUND = 3600, LOCK = 60, MAX = 32;

async function enc(addr, signer, v) {
  const i = await fhevm.createEncryptedInput(addr, signer.address).add64(BigInt(v)).encrypt();
  return { handle: i.handles[0], proof: i.inputProof };
}
const userBool = (h, addr, s) => fhevm.userDecryptEbool(h, addr, s);

describe("NdimbalPool — batched draw at 32 savers", function () {
  this.timeout(0);

  it("produces exactly one winner across 32 savers via batched draw, and the winner can claim", async function () {
    const signers = await ethers.getSigners();
    expect(signers.length, "need >= 33 signers (set hardhat accounts.count)").to.be.greaterThanOrEqual(MAX + 1);
    const deployer = signers[0];
    const savers = signers.slice(1, 1 + MAX);

    const token = await (await ethers.getContractFactory("MockNdimbalToken")).deploy();
    await token.waitForDeployment();
    const tokenAddr = await token.getAddress();
    const pool = await (await ethers.getContractFactory("NdimbalPool")).deploy(tokenAddr, ROUND, LOCK, MAX, deployer.address, ethers.ZeroAddress);
    await pool.waitForDeployment();
    const poolAddr = await pool.getAddress();

    // 32 savers deposit distinct amounts
    for (let k = 0; k < MAX; k++) {
      const w = savers[k];
      const m = await enc(tokenAddr, w, 1_000_000);
      await token.connect(w).mint(w.address, m.handle, m.proof);
      await token.connect(w).setOperator(poolAddr, 2n ** 47n);
      const d = await enc(poolAddr, w, 100 + k * 10);
      await pool.connect(w).deposit(d.handle, d.proof);
    }
    expect(await pool.participantCount()).to.equal(BigInt(MAX));

    // fund + advance
    const fm = await enc(tokenAddr, deployer, 1_000_000);
    await token.connect(deployer).mint(deployer.address, fm.handle, fm.proof);
    await token.connect(deployer).setOperator(poolAddr, 2n ** 47n);
    const f = await enc(poolAddr, deployer, 5000);
    await pool.connect(deployer).fundPrize(f.handle, f.proof);
    await ethers.provider.send("evm_increaseTime", [ROUND + 1]);
    await ethers.provider.send("evm_mine", []);

    // BATCHED draw (batch = 8): tickets then winners, looping until each phase completes
    let txs = 0;
    while ((await pool.drawPhase(0)) < 2n) { await pool.drawTickets(8); txs++; }
    while ((await pool.drawPhase(0)) < 3n) { await pool.drawWinners(8); txs++; }
    console.log(`      draw completed in ${txs} batch transactions for ${MAX} savers`);

    // EXACTLY ONE winner across all 32
    let winners = 0;
    for (const w of savers) {
      if (await userBool(await pool.didWin(0, w.address), poolAddr, w)) winners++;
    }
    expect(winners, "exactly one winner across the whole batched pool").to.equal(1);

    // every saver can claim without reverting (winner gets the pot, losers move 0)
    for (const w of savers) {
      await expect(pool.connect(w).claim(0)).to.not.be.reverted;
    }
  });
});
