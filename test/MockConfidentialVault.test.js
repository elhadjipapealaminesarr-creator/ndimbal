const { expect } = require("chai");
const { ethers, fhevm } = require("hardhat");
const { FhevmType } = require("@fhevm/hardhat-plugin");

// MockConfidentialVault — Sepolia stand-in for the Steakhouse Confidential Prime USDC vault (Morpho).
//   npx hardhat test test/MockConfidentialVault.test.js
// Proves the confidential yield loop in isolation before wiring it into NDIMBAL: deposit a confidential
// asset, watch the position grow as yield accrues, redeem principal + yield. Same surface as the real
// mainnet vault; only the yield is simulated (a testnet has no real strategy).

async function enc(addr, signer, v) {
  const i = await fhevm.createEncryptedInput(addr, signer.address).add64(BigInt(v)).encrypt();
  return { handle: i.handles[0], proof: i.inputProof };
}
const u64 = (h, addr, s) => fhevm.userDecryptEuint(FhevmType.euint64, h, addr, s);

describe("MockConfidentialVault", function () {
  this.timeout(0);

  async function setup() {
    const [treasury, pool] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockNdimbalToken")).deploy();
    await token.waitForDeployment();
    const tokenAddr = await token.getAddress();
    const vault = await (await ethers.getContractFactory("MockConfidentialVault")).deploy(tokenAddr);
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();
    return { treasury, pool, token, tokenAddr, vault, vaultAddr };
  }
  async function mintApprove(token, tokenAddr, vaultAddr, who, amount) {
    const m = await enc(tokenAddr, who, amount);
    await token.connect(who).mint(who.address, m.handle, m.proof);
    await token.connect(who).setOperator(vaultAddr, 2n ** 47n);
  }

  it("accepts a confidential deposit and tracks the position", async function () {
    const { pool, token, tokenAddr, vault, vaultAddr } = await setup();
    await mintApprove(token, tokenAddr, vaultAddr, pool, 1_000_000);
    const d = await enc(vaultAddr, pool, 100);
    await vault.connect(pool).depositExternal(d.handle, d.proof);
    const pos = await u64(await vault.confidentialBalanceOf(pool.address), vaultAddr, pool);
    expect(pos).to.equal(100n);
  });

  it("grows the position as yield accrues, then redeems principal + yield (the loop closes)", async function () {
    const { treasury, pool, token, tokenAddr, vault, vaultAddr } = await setup();
    // treasury seeds a reserve so the vault can back the simulated yield on redeem
    await mintApprove(token, tokenAddr, vaultAddr, treasury, 1_000_000);
    const seed = await enc(vaultAddr, treasury, 10_000);
    await vault.connect(treasury).depositExternal(seed.handle, seed.proof);

    // the pool deposits 100 of principal
    await mintApprove(token, tokenAddr, vaultAddr, pool, 1_000_000);
    const d = await enc(vaultAddr, pool, 100);
    await vault.connect(pool).depositExternal(d.handle, d.proof);

    // simulate 20 of yield accruing to the pool's position
    await vault.connect(treasury).accrue(pool.address, 20);
    const pos = await u64(await vault.confidentialBalanceOf(pool.address), vaultAddr, pool);
    expect(pos).to.equal(120n); // 100 principal + 20 yield

    // pool redeems its full position -> 120 back; reserve backs the 20 of yield
    const before = await u64(await token.confidentialBalanceOf(pool.address), tokenAddr, pool);
    const r = await enc(vaultAddr, pool, 120);
    await vault.connect(pool).redeemExternal(r.handle, r.proof);
    const after = await u64(await token.confidentialBalanceOf(pool.address), tokenAddr, pool);
    expect(after - before).to.equal(120n);
    const posAfter = await u64(await vault.confidentialBalanceOf(pool.address), vaultAddr, pool);
    expect(posAfter).to.equal(0n);
  });

  it("never redeems more than the position (clamped)", async function () {
    const { pool, token, tokenAddr, vault, vaultAddr } = await setup();
    await mintApprove(token, tokenAddr, vaultAddr, pool, 1_000_000);
    const d = await enc(vaultAddr, pool, 50);
    await vault.connect(pool).depositExternal(d.handle, d.proof);
    const before = await u64(await token.confidentialBalanceOf(pool.address), tokenAddr, pool);
    const r = await enc(vaultAddr, pool, 999); // ask for way more than the 50 position
    await vault.connect(pool).redeemExternal(r.handle, r.proof);
    const after = await u64(await token.confidentialBalanceOf(pool.address), tokenAddr, pool);
    expect(after - before).to.equal(50n); // clamped to the position
  });
});
