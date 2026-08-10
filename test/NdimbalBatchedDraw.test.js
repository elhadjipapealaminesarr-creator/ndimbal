const { expect } = require("chai");
const { ethers, fhevm } = require("hardhat");
const { FhevmType } = require("@fhevm/hardhat-plugin");

// NDIMBAL — the batched TOP-3 draw is correct at scale.
//   npx hardhat test test/NdimbalBatchedDraw.test.js
// Fills the pool to 32 savers and runs the 4-phase batched draw (tickets → 2nd max → 3rd max → winners) in
// batches of 8. Must produce EXACTLY 3 winners whose claimable prizes are the tiers 50% / 30% / 20% of the pot.

const ROUND = 3600, LOCK = 60, MAX = 32;

async function enc(addr, signer, v) {
  const i = await fhevm.createEncryptedInput(addr, signer.address).add64(BigInt(v)).encrypt();
  return { handle: i.handles[0], proof: i.inputProof };
}
const userBool = (h, addr, s) => fhevm.userDecryptEbool(h, addr, s);
const userU64 = (h, addr, s) => fhevm.userDecryptEuint(FhevmType.euint64, h, addr, s);

describe("NdimbalPool — batched top-3 draw at 32 savers", function () {
  this.timeout(0);

  it("awards the top-3 tickets 50/30/20 of the pot across 32 savers (batched)", async function () {
    const signers = await ethers.getSigners();
    expect(signers.length).to.be.greaterThanOrEqual(MAX + 1);
    const deployer = signers[0];
    const savers = signers.slice(1, 1 + MAX);

    const token = await (await ethers.getContractFactory("MockNdimbalToken")).deploy();
    await token.waitForDeployment();
    const tokenAddr = await token.getAddress();
    const pool = await (await ethers.getContractFactory("NdimbalPool")).deploy(tokenAddr, ROUND, LOCK, MAX, deployer.address, ethers.ZeroAddress);
    await pool.waitForDeployment();
    const poolAddr = await pool.getAddress();

    for (let k = 0; k < MAX; k++) {
      const w = savers[k];
      const m = await enc(tokenAddr, w, 1_000_000);
      await token.connect(w).mint(w.address, m.handle, m.proof);
      await token.connect(w).setOperator(poolAddr, 2n ** 47n);
      const d = await enc(poolAddr, w, 100 + k * 10);
      await pool.connect(w).deposit(d.handle, d.proof);
    }
    expect(await pool.participantCount()).to.equal(BigInt(MAX));

    // fund the pot with 5000 → tiers 2500 / 1500 / 1000
    const fm = await enc(tokenAddr, deployer, 1_000_000);
    await token.connect(deployer).mint(deployer.address, fm.handle, fm.proof);
    await token.connect(deployer).setOperator(poolAddr, 2n ** 47n);
    const f = await enc(poolAddr, deployer, 5000);
    await pool.connect(deployer).fundPrize(f.handle, f.proof);
    await ethers.provider.send("evm_increaseTime", [ROUND + 1]);
    await ethers.provider.send("evm_mine", []);

    // 4-phase batched draw (batch = 8)
    let txs = 0;
    while ((await pool.drawPhase(0)) < 2n) { await pool.drawTickets(8); txs++; }
    while ((await pool.drawPhase(0)) < 3n) { await pool.drawMax2(8); txs++; }
    while ((await pool.drawPhase(0)) < 4n) { await pool.drawMax3(8); txs++; }
    while ((await pool.drawPhase(0)) < 5n) { await pool.drawWinners(8); txs++; }
    console.log(`      top-3 draw completed in ${txs} batch transactions for ${MAX} savers`);

    // collect the winners and their claimable prizes
    const shares = [];
    for (const w of savers) {
      if (await userBool(await pool.didWin(0, w.address), poolAddr, w)) {
        shares.push(await userU64(await pool.claimableOf(0, w.address), poolAddr, w));
      }
    }
    expect(shares.length, "exactly three winners (top-3)").to.equal(3);
    shares.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // descending
    expect(shares).to.deep.equal([2500n, 1500n, 1000n]); // 50% / 30% / 20% of 5000

    // and each winner can claim their tier without reverting
    for (const w of savers) {
      await expect(pool.connect(w).claim(0)).to.not.be.reverted;
    }
  });
});
