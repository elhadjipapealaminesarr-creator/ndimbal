// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {INdimbalToken} from "../INdimbalToken.sol";
import {IConfidentialVault} from "../IConfidentialVault.sol";

/// @title MockConfidentialVault — a Sepolia stand-in for the Steakhouse Confidential Prime USDC vault (Morpho).
/// @notice Same OBSERVABLE surface as the real mainnet vault — deposit a confidential asset, hold a position
///         that grows as yield accrues, redeem in asset terms — but the yield itself is **simulated** by
///         `accrue()` because a testnet has no real DeFi strategy. In production NDIMBAL points at the real
///         mainnet vault (cUSDC `0xe978…72B2`) via the same `IConfidentialVault` interface — no NDIMBAL code
///         change, only the constructor address differs.
/// @dev    Position is tracked 1 share = 1 asset for clarity. Since `accrue()` credits a position without
///         adding tokens, the vault must be pre-seeded with a reserve (any prior deposit) large enough to
///         back the simulated yield on redeem; `confidentialTransfer` clamps to the vault's real balance.
contract MockConfidentialVault is IConfidentialVault, ZamaEthereumConfig {
    INdimbalToken public immutable assetToken;

    mapping(address => euint64) private _bal; // confidential position, in asset terms

    event Deposited(address indexed holder);
    event Redeemed(address indexed holder);
    event YieldAccrued(address indexed holder); // MOCK ONLY

    constructor(INdimbalToken asset_) {
        assetToken = asset_;
    }

    function asset() external view returns (INdimbalToken) {
        return assetToken;
    }

    function _pos(address a) internal returns (euint64 b) {
        b = _bal[a];
        if (!FHE.isInitialized(b)) b = FHE.asEuint64(0);
    }

    function _credit(address holder, euint64 amt) internal {
        euint64 nb = FHE.add(_pos(holder), amt);
        _bal[holder] = nb;
        FHE.allowThis(nb);
        FHE.allow(nb, holder);
    }

    /// @notice Deposit an ALREADY-IMPORTED encrypted amount. Caller (a contract, e.g. NDIMBAL) must have set
    ///         this vault as an operator on the asset and granted it transient access to `assets`.
    function deposit(euint64 assets) external returns (euint64 deposited) {
        FHE.allowTransient(assets, address(assetToken));
        deposited = assetToken.confidentialTransferFrom(msg.sender, address(this), assets);
        _credit(msg.sender, deposited);
        FHE.allowThis(deposited);
        FHE.allow(deposited, msg.sender);
        emit Deposited(msg.sender);
    }

    /// @notice EOA-friendly deposit (imports the external input itself). Handy for tests and direct users;
    ///         the (contract, signer) binding is enforced by `FHE.fromExternal`.
    function depositExternal(externalEuint64 encAssets, bytes calldata inputProof) external returns (euint64 deposited) {
        euint64 assets = FHE.fromExternal(encAssets, inputProof);
        FHE.allowTransient(assets, address(assetToken));
        deposited = assetToken.confidentialTransferFrom(msg.sender, address(this), assets);
        _credit(msg.sender, deposited);
        FHE.allowThis(deposited);
        FHE.allow(deposited, msg.sender);
        emit Deposited(msg.sender);
    }

    /// @notice Redeem up to your position (asset terms). Never sends more than the position or the vault holds.
    function redeem(euint64 assets) external returns (euint64 withdrawn) {
        euint64 send = FHE.min(assets, _pos(msg.sender));
        euint64 nb = FHE.sub(_pos(msg.sender), send);
        _bal[msg.sender] = nb;
        FHE.allowThis(nb);
        FHE.allow(nb, msg.sender);
        FHE.allowTransient(send, address(assetToken));
        withdrawn = assetToken.confidentialTransfer(msg.sender, send);
        FHE.allowThis(withdrawn);
        FHE.allow(withdrawn, msg.sender);
        emit Redeemed(msg.sender);
    }

    /// @notice EOA-friendly redeem (imports the external input itself). Handy for tests and direct users.
    function redeemExternal(externalEuint64 encAssets, bytes calldata inputProof) external returns (euint64 withdrawn) {
        euint64 assets = FHE.fromExternal(encAssets, inputProof);
        euint64 send = FHE.min(assets, _pos(msg.sender));
        euint64 nb = FHE.sub(_pos(msg.sender), send);
        _bal[msg.sender] = nb;
        FHE.allowThis(nb);
        FHE.allow(nb, msg.sender);
        FHE.allowTransient(send, address(assetToken));
        withdrawn = assetToken.confidentialTransfer(msg.sender, send);
        FHE.allowThis(withdrawn);
        FHE.allow(withdrawn, msg.sender);
        emit Redeemed(msg.sender);
    }

    function confidentialBalanceOf(address account) external view returns (euint64) {
        return _bal[account];
    }

    /// @notice MOCK ONLY — simulate accrued yield for `holder` by a PLAINTEXT amount (there is no real
    ///         strategy on a testnet). The vault must hold enough reserve to back this on redeem. This
    ///         function does NOT exist on the real vault, where yield accrues from the Morpho strategy.
    function accrue(address holder, uint64 yieldAmount) external {
        _credit(holder, FHE.asEuint64(yieldAmount));
        emit YieldAccrued(holder);
    }
}
