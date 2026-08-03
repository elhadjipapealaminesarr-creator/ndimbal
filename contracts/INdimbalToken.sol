// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {euint64} from "@fhevm/solidity/lib/FHE.sol";

/// @title INdimbalToken — the confidential-token surface NDIMBAL needs (ERC-7984 operator flow)
/// @notice Operator transfers take an ALREADY-IMPORTED `euint64` (not an external input). This is the
///         correct fhEVM pattern: the calling contract imports the user's encrypted input with
///         `FHE.fromExternal` (so the (contract, signer) binding matches) and grants the token
///         transient access to the resulting handle before calling `confidentialTransferFrom`.
interface INdimbalToken {
    /// @notice Encrypted balance handle of `account`.
    function confidentialBalanceOf(address account) external view returns (euint64);

    /// @notice Grant/revoke `operator` the right to move the caller's tokens until `until`.
    function setOperator(address operator, uint48 until) external;

    /// @notice True if `operator` may currently move `holder`'s tokens.
    function isOperator(address holder, address operator) external view returns (bool);

    /// @notice Operator-pull: move an already-imported encrypted `amount` from `from` to `to`.
    /// @return transferred The amount actually moved (clamped to the balance).
    function confidentialTransferFrom(address from, address to, euint64 amount)
        external
        returns (euint64 transferred);

    /// @notice Send an already-imported encrypted `amount` held by the caller to `to`.
    /// @return transferred The amount actually moved (clamped to the balance).
    function confidentialTransfer(address to, euint64 amount) external returns (euint64 transferred);
}
