require("@nomicfoundation/hardhat-toolbox");
require("@fhevm/hardhat-plugin");
require("dotenv").config();

// Deployment config comes from a .env file (never commit it):
//   SEPOLIA_RPC_URL=...     a Sepolia RPC endpoint (Infura/Alchemy or a public one)
//   PRIVATE_KEY=0x...       the deployer wallet's private key — KEEP IT SECRET
//   ETHERSCAN_API_KEY=...   free key from https://etherscan.io/myapikey (for source verification)

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: { enabled: true, runs: 800 },
      evmVersion: "cancun",
    },
  },
  networks: {
    // Local test network: 40 funded accounts so the capacity suite can fill the pool to 32.
    hardhat: {
      accounts: { count: 40 },
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
  sourcify: {
    enabled: false,
  },
};
