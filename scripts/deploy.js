// Deploy NDIMBAL to the configured network (Sepolia).
//   npx hardhat run scripts/deploy-ndimbal.js --network sepolia
//
// Deploys a confidential token (demo cUSDC stand-in) + the NdimbalPool.
// In production, pass Zama's real confidential USDT (cUSDC) address instead of the mock.
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance :", hre.ethers.formatEther(bal), "ETH\n");

  // 1) Confidential settlement token (demo). Replace with the real cUSDC address for production.
  const Token = await hre.ethers.getContractFactory("MockNdimbalToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("MockNdimbalToken:", tokenAddr);

  // 2) NDIMBAL pool — 1-day rounds, deposits lock 1h before the draw (anti-snipe), up to 32-participant cap (batched draw).
  const DAY = 24 * 3600;
  const LOCK = 3600;
  const MAX = 32;  // batched draw (drawTickets/drawWinners) scales to 32 — see test/capacity-32.test.js
  // Confidential yield vault — Sepolia mock of the Steakhouse Confidential Prime USDC vault (Morpho).
  // In production, pass the real mainnet vault address instead (cUSDC 0xe978…72B2).
  const Vault = await hre.ethers.getContractFactory("MockConfidentialVault");
  const vault = await Vault.deploy(tokenAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("MockConfidentialVault:", vaultAddr);

  const Pool = await hre.ethers.getContractFactory("NdimbalPool");
  const pool = await Pool.deploy(tokenAddr, DAY, LOCK, MAX, deployer.address, vaultAddr);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("NdimbalPool     :", poolAddr);

  console.log("\nSave these addresses. Verify the source on Etherscan with:");
  console.log(`  npx hardhat verify --network sepolia ${tokenAddr}`);
  console.log(`  npx hardhat verify --network sepolia ${vaultAddr} ${tokenAddr}`);
  console.log(`  npx hardhat verify --network sepolia ${poolAddr} ${tokenAddr} ${DAY} ${LOCK} ${MAX} ${deployer.address} ${vaultAddr}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
