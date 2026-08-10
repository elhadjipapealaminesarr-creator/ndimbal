// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {euint64} from "@fhevm/solidity/lib/FHE.sol";
import {INdimbalToken} from "./INdimbalToken.sol";

/// @title IConfidentialVault — the confidential yield-vault surface NDIMBAL routes idle capital through.
/// @notice Mirrors the observable behaviour of the **Steakhouse Confidential Prime USDC vault on Morpho**
///         (Zama's first confidential-DeFi yield venue): deposit a confidential asset (cUSDC / ERC-7984),
///         hold a position that grows as the underlying strategy earns yield, redeem in asset terms — all
///         while balances and position sizes stay encrypted. Amounts are ALREADY-IMPORTED `euint64` handles
///         (the ERC-7984 operator pattern): the caller imports the user input with `FHE.fromExternal`, sets
///         this vault as an operator on the asset, and grants the vault transient access before calling.
/// @dev    On Sepolia the concrete implementation is `MockConfidentialVault` (no real strategy exists on a
///         testnet); in production the same interface points at the real mainnet vault (cUSDC 0xe978…72B2).
interface IConfidentialVault {
    /// @notice The confidential asset this vault accepts (e.g. cUSDC).
    function asset() external view returns (INdimbalToken);

    /// @notice Deposit an already-imported encrypted `assets` amount; returns the amount actually deposited.
    function deposit(euint64 assets) external returns (euint64 deposited);

    /// @notice Redeem (in asset terms) up to your current position; returns the amount actually sent back.
    function redeem(euint64 assets) external returns (euint64 withdrawn);

    /// @notice Encrypted position of `account`, denominated in the asset (grows as yield accrues).
    function confidentialBalanceOf(address account) external view returns (euint64);
}
