// Deploy NDIMBAL to the configured network (Sepolia).
//   npx hardhat run scripts/deploy-ndimbal.js --network sepolia
//
// Deploys a confidential token (demo cUSDT stand-in) + the NdimbalPool.
// In production, pass Zama's real confidential USDT (cUSDT) address instead of the mock.
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance :", hre.ethers.formatEther(bal), "ETH\n");

  // 1) Confidential settlement token (demo). Replace with the real cUSDT address for production.
  const Token = await hre.ethers.getContractFactory("MockNdimbalToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("MockNdimbalToken:", tokenAddr);

  // 2) NDIMBAL pool — 1-day rounds, deposits lock 1h before the draw (anti-snipe).
  const DAY = 24 * 3600;
  const LOCK = 3600;
  const MAX = 32;
  const Pool = await hre.ethers.getContractFactory("NdimbalPool");
  const pool = await Pool.deploy(tokenAddr, DAY, LOCK, MAX, deployer.address);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("NdimbalPool     :", poolAddr);

  console.log("\nSave these addresses. Verify the source on Etherscan with:");
  console.log(`  npx hardhat verify --network sepolia ${tokenAddr}`);
  console.log(`  npx hardhat verify --network sepolia ${poolAddr} ${tokenAddr} ${DAY} ${LOCK} ${MAX} ${deployer.address}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
