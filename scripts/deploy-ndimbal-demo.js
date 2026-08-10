// Deploy a SHORT-ROUND demo instance of NDIMBAL to Sepolia, so anyone (the jury) can play a full
// round — deposit, wait a couple of minutes, draw, decrypt the win — without waiting a full day.
//
//   npx hardhat run scripts/deploy-ndimbal-demo.js --network sepolia
//
// The canonical 1-day-round contract stays the "production-config" reference; this instance is
// purely to make the live dApp fully playable during evaluation.
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance :", hre.ethers.formatEther(bal), "ETH\n");

  const Token = await hre.ethers.getContractFactory("MockNdimbalToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("MockNdimbalToken:", tokenAddr);

  const ROUND = 600; // 10-min rounds — 8-min deposit window, no timing stress for a live demo
  const LOCK = 120;  // deposits lock 2 min before the draw
  const MAX = 3;  // HCU-proven cap: draw() reverts at 4 (HCUTransactionDepthLimitExceeded) — see test/capacity-32.test.js    // max active participants (anti-DoS cap)
  // Confidential yield vault — Sepolia mock of the Steakhouse Confidential Prime USDC vault (Morpho).
  // In production, pass the real mainnet vault address instead (cUSDC 0xe978…72B2).
  const Vault = await hre.ethers.getContractFactory("MockConfidentialVault");
  const vault = await Vault.deploy(tokenAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("MockConfidentialVault:", vaultAddr);

  const Pool = await hre.ethers.getContractFactory("NdimbalPool");
  const pool = await Pool.deploy(tokenAddr, ROUND, LOCK, MAX, deployer.address, vaultAddr);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("NdimbalPool     :", poolAddr, `(round=${ROUND}s, lock=${LOCK}s, max=${MAX})`);

  console.log("\nPoint app.html at these addresses. Verify the source on Etherscan with:");
  console.log(`  npx hardhat verify --network sepolia ${tokenAddr}`);
  console.log(`  npx hardhat verify --network sepolia ${vaultAddr} ${tokenAddr}`);
  console.log(`  npx hardhat verify --network sepolia ${poolAddr} ${tokenAddr} ${ROUND} ${LOCK} ${MAX} ${deployer.address} ${vaultAddr}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
