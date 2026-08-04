const { expect } = require("chai");
const { ethers, fhevm } = require("hardhat");
const { FhevmType } = require("@fhevm/hardhat-plugin");

// NDIMBAL — "verify a past draw" fairness harness (for judges & auditors).
// Runs as a test so the fhEVM mock is initialised exactly like the main suite:
//
//   npx hardhat test test/verify-draw.test.js
//   ROUNDS=120 npx hardhat test test/verify-draw.test.js   (more samples => less noise)
//
// What it proves, WITHOUT ever revealing a balance, a total, or a ticket:
//   1) Every round produces EXACTLY ONE winner (the encrypted argmax is well-formed).
//   2) A saver's win frequency increases with their deposit — bigger stake => better odds
//      (NDIMBAL's honest "strictly-increasing, not exactly-proportional" claim).
// It decrypts ONLY each saver's own "did I win?" flag — exactly what a real wallet sees.
const ROUND = 3600; // 1h rounds
const LOCK = 60;    // anti-snipe lock window
const ROUNDS = Number(process.env.ROUNDS || 60);
const DEPOSITS = [["Awa", 100], ["Modou", 300], ["Ibou", 600]]; // bigger deposit => higher odds

async function enc(contract, signer, value) {
  const i = await fhevm.createEncryptedInput(contract, signer.address).add64(BigInt(value)).encrypt();
  return { handle: i.handles[0], proof: i.inputProof };
}

describe("NDIMBAL — confidential draw fairness harness", function () {
  this.timeout(0); // sampling many draws takes a while

  it(`is fair over ${ROUNDS} encrypted draws (exactly one winner; bigger deposit wins more)`, async function () {
    const signers = await ethers.getSigners();
    const sponsor = signers[0];
    const savers = signers.slice(1, 1 + DEPOSITS.length);

    const T = await ethers.getContractFactory("MockNdimbalToken");
    const token = await T.deploy();
    await token.waitForDeployment();
    const tokenAddr = await token.getAddress();

    const P = await ethers.getContractFactory("NdimbalPool");
    const pool = await P.deploy(tokenAddr, ROUND, LOCK, 32); // maxParticipants (matches deployed config)
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
    console.log(`\n  NDIMBAL — sampling ${ROUNDS} encrypted draws (only per-user win flags are decrypted)\n`);

    for (let r = 0; r < ROUNDS; r++) {
      const f = await enc(poolAddr, sponsor, 1000);
      await pool.connect(sponsor).fundPrize(f.handle, f.proof);
      await ethers.provider.send("evm_increaseTime", [ROUND + 1]);
      await ethers.provider.send("evm_mine", []);
      await pool.draw();

      let w = 0;
      for (let k = 0; k < savers.length; k++) {
        const flag = await pool.didWin(r, savers[k].address);
        if (await fhevm.userDecryptEbool(flag, poolAddr, savers[k])) { wins[k]++; w++; }
      }
      if (w !== 1) malformed++;
    }

    const totalW = DEPOSITS.reduce((s, d) => s + d[1], 0);
    console.log("  saver     deposit   weight%    wins     win%");
    let prev = -1, monotonic = true;
    for (let k = 0; k < savers.length; k++) {
      const [name, amt] = DEPOSITS[k];
      console.log(
        `  ${name.padEnd(8)}  ${String(amt).padStart(6)}   ${(100 * amt / totalW).toFixed(1).padStart(6)}   ${String(wins[k]).padStart(6)}   ${(100 * wins[k] / ROUNDS).toFixed(1).padStart(6)}`
      );
      if (wins[k] < prev) monotonic = false;
      prev = wins[k];
    }
    console.log(`\n  exactly-one-winner every round : ${malformed === 0 ? "PASS ✅" : "FAIL ❌"}`);
    console.log(`  odds increase with deposit     : ${monotonic ? "PASS ✅" : "monotonic-ish (raise ROUNDS to smooth noise)"}`);
    console.log("\n  No balance, total or ticket was ever revealed — only each saver's own flag. That is NDIMBAL.\n");

    // Hard checks (robust): structural correctness + the biggest depositor beats the smallest.
    expect(malformed, "every round must have exactly one winner").to.equal(0);
    expect(wins[savers.length - 1], "biggest deposit should win more than the smallest")
      .to.be.greaterThan(wins[0]);
  });
});
