const { expect } = require("chai");
const { ethers, fhevm } = require("hardhat");

// NDIMBAL — a batched draw abandoned mid-flight must be RECOVERABLE, and churn during the draw
// must never brick it (#17). The draw runs across several transactions
// (drawTickets -> drawMax2 -> drawMax3 -> drawWinners); this proves:
//   A) a half-run draw resumes cleanly (any caller) and still produces exactly 3 winners; and
//   B) a leave() mid-ticketing (which swap-pops the LIVE participants[]) does NOT desync the frozen
//      snapshot -> the draw still completes without revert, deposits reopen, and the leaver can't win.
//   npx hardhat test test/NdimbalAbandonedDraw.test.js
const ROUND = 3600, LOCK = 60;

async function enc(addr, signer, v) {
  const i = await fhevm.createEncryptedInput(addr, signer.address).add64(BigInt(v)).encrypt();
  return { handle: i.handles[0], proof: i.inputProof };
}
async function deployFilled(deployer, savers, max) {
  const token = await (await ethers.getContractFactory("MockNdimbalToken")).deploy();
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  const pool = await (await ethers.getContractFactory("NdimbalPool")).deploy(tokenAddr, ROUND, LOCK, max, deployer.address, ethers.ZeroAddress);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  for (let k = 0; k < savers.length; k++) {
    const w = savers[k];
    const m = await enc(tokenAddr, w, 1_000_000);
    await token.connect(w).mint(w.address, m.handle, m.proof);
    await token.connect(w).setOperator(poolAddr, 2n ** 47n);
    const d = await enc(poolAddr, w, 100 + k * 10);
    await pool.connect(w).deposit(d.handle, d.proof);
  }
  // fund a prize so a full round is realistic
  const mm = await enc(tokenAddr, deployer, 1_000_000);
  await token.connect(deployer).mint(deployer.address, mm.handle, mm.proof);
  await token.connect(deployer).setOperator(poolAddr, 2n ** 47n);
  const f = await enc(poolAddr, deployer, 10_000);
  await pool.connect(deployer).fundPrize(f.handle, f.proof);
  await ethers.provider.send("evm_increaseTime", [ROUND + 1]);
  await ethers.provider.send("evm_mine", []);
  return { token, tokenAddr, pool, poolAddr };
}
async function finishDraw(pool, B = 8) {
  while ((await pool.drawPhase(0)) < 2n) await pool.drawTickets(B);
  while ((await pool.drawPhase(0)) < 3n) await pool.drawMax2(B);
  while ((await pool.drawPhase(0)) < 4n) await pool.drawMax3(B);
  while ((await pool.drawPhase(0)) < 5n) await pool.drawWinners(B);
}

describe("NDIMBAL — abandoned / resumed draw is recoverable (#17)", function () {
  this.timeout(0);

  it("A) resumes a half-run batched draw and still yields exactly 3 winners", async function () {
    const [deployer, a, b, c, d, e] = await ethers.getSigners();
    const savers = [a, b, c, d, e];
    const { pool, poolAddr } = await deployFilled(deployer, savers, 8);

    expect(await pool.depositsOpen()).to.equal(false); // round is over → locked until the draw completes

    // Start ticketing but ABANDON after one small batch (2 of 5). The draw freezes the participant list here.
    await pool.drawTickets(2);
    expect(await pool.drawPhase(0)).to.equal(1n);

    // Resume to completion in small batches — must finish cleanly.
    await finishDraw(pool, 2);
    expect(await pool.drawPhase(0)).to.equal(5n);
    expect(await pool.round()).to.equal(1n);
    expect(await pool.depositsOpen()).to.equal(true); // deposits reopen once the round advanced

    let wins = 0;
    for (const w of savers) {
      const flag = await pool.didWin(0, w.address);
      if (await fhevm.userDecryptEbool(flag, poolAddr, w)) wins++;
    }
    expect(wins, "5 positive savers, no churn → exactly the top-3 win").to.equal(3);
  });

  it("B) a leave() mid-ticketing (swap-pop) does not brick the draw; the leaver can't win", async function () {
    const [deployer, a, b, c, d, e] = await ethers.getSigners();
    const savers = [a, b, c, d, e];
    const { pool, poolAddr } = await deployFilled(deployer, savers, 8);

    // Ticket the first 2 (indices 0,1), then a NON-last saver leaves → forces a real swap-pop of the LIVE list.
    await pool.drawTickets(2);
    expect(await pool.drawPhase(0)).to.equal(1n);
    await pool.connect(savers[1]).leave();               // b (index 1) leaves; e is swapped into its live slot
    expect(await pool.participantCount()).to.equal(4n);  // live list shrank...

    // ...but the FROZEN snapshot still has 5 entries, so resuming must NOT revert (this is the #17 regression).
    await finishDraw(pool, 2);
    expect(await pool.drawPhase(0)).to.equal(5n);         // completed cleanly despite the mid-draw reindex
    expect(await pool.depositsOpen()).to.equal(true);

    // The saver who left has a zeroed balance → the zero-balance guard means they cannot be a winner.
    const leftFlag = await pool.didWin(0, savers[1].address);
    expect(await fhevm.userDecryptEbool(leftFlag, poolAddr, savers[1]), "a saver who left cannot win").to.equal(false);
  });
});
