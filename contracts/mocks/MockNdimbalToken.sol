// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, euint64, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {INdimbalToken} from "../INdimbalToken.sol";

/// @title MockNdimbalToken — TEST-ONLY confidential token (ERC-7984 operator flow, euint64 amounts)
/// @notice Minimal confidential token used ONLY by the NDIMBAL test suite. NOT audited, NOT for
///         production. Balances are FHE ciphertexts; operator transfers take already-imported euint64.
contract MockNdimbalToken is INdimbalToken, ZamaEthereumConfig {
    mapping(address => euint64) private _bal;
    mapping(address => mapping(address => uint48)) private _op;

    /// @notice TEST HELPER: mint an encrypted `amount` to `to` (the holder calls the token directly,
    ///         so the (token, holder) input binding matches — no forwarding issue here).
    function mint(address to, externalEuint64 amount, bytes calldata inputProof) external {
        euint64 amt = FHE.fromExternal(amount, inputProof);
        _credit(to, amt);
    }

    function confidentialBalanceOf(address account) external view returns (euint64) {
        return _bal[account];
    }

    function setOperator(address operator, uint48 until) external {
        _op[msg.sender][operator] = until;
    }

    function isOperator(address holder, address operator) public view returns (bool) {
        return _op[holder][operator] >= uint48(block.timestamp);
    }

    function confidentialTransferFrom(address from, address to, euint64 amount)
        external
        returns (euint64 transferred)
    {
        require(from == msg.sender || isOperator(from, msg.sender), "not operator");
        transferred = _move(from, to, amount);
    }

    function confidentialTransfer(address to, euint64 amount) external returns (euint64 transferred) {
        transferred = _move(msg.sender, to, amount);
    }

    // ---------------------------------------------------------------- internals
    function _current(address a) internal returns (euint64 cur) {
        euint64 stored = _bal[a];
        cur = (euint64.unwrap(stored) == bytes32(0)) ? FHE.asEuint64(0) : stored;
    }

    function _credit(address a, euint64 amt) internal {
        euint64 nb = FHE.add(_current(a), amt);
        _bal[a] = nb;
        FHE.allowThis(nb);
        FHE.allow(nb, a);
    }

    function _move(address from, address to, euint64 amt) internal returns (euint64 sent) {
        euint64 fromBal = _current(from);
        ebool ok = FHE.le(amt, fromBal);
        sent = FHE.select(ok, amt, fromBal); // never move more than the balance

        euint64 nf = FHE.sub(fromBal, sent);
        euint64 nt = FHE.add(_current(to), sent);
        _bal[from] = nf;
        _bal[to] = nt;

        FHE.allowThis(nf);
        FHE.allow(nf, from);
        FHE.allowThis(nt);
        FHE.allow(nt, to);
        FHE.allowThis(sent);
        FHE.allow(sent, msg.sender); // let the caller (pool) read the moved amount
    }
}
