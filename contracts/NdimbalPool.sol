// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, euint32, euint64, euint128, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {INdimbalToken} from "./INdimbalToken.sol";

/// @title NDIMBAL — the no-loss prize-savings pool where winning lifts the whole community, privately
/// @author El Hadji Pape Alamine Sarr (Kaddu) — Zama Developer Program, Mainnet Season 4
/// @notice A confidential "PoolTogether": savers deposit a confidential token (ERC-7984, e.g. cUSDT),
///         keep their principal (withdraw at any time — *no loss*), and a periodic draw awards the
///         funded prize to one saver. Unique — and only possible with FHE:
///
///         1. MAXIMALLY-PRIVATE DRAW — even the pool's *total* never leaks. Each round every saver gets
///            an encrypted ticket `ticket = balance × protocol-random`; the winner is the encrypted
///            argmax. Odds strictly increase with the deposit, yet no balance, no total and no ticket
///            is ever public. (An exactly-proportional variant is possible once an on-chain decryption
///            oracle is available to reveal the aggregate total — see NOTES in the README.)
///         2. WINNER-ONLY REVEAL — each saver gets an encrypted "did I win?" flag they alone decrypt.
///            The operator can neither see nor grind the result (randomness is protocol-provided).
///         3. PRIVATE SOLIDARITY DIAL — each saver privately pre-sets what share of a win they would
///            give back to a community fund. Generosity with ZERO social pressure; only the aggregate
///            donated is public. Turning a lottery into mutual aid ("ndimbal" in Wolof) is impossible
///            without confidential preferences.
///
/// @dev    Prize = yield, modelled here as an amount funded per round by a sponsor / yield source
///         (`fundPrize`); real yield routing (e.g. an ERC-4626 / Morpho vault) plugs into `fundPrize`.
///         Ticket = `balance(euint64) × randEuint32` fits euint64 for demo-scale balances; widen to
///         euint128 for very large pools. Target chain: Sepolia.
contract NdimbalPool is ZamaEthereumConfig {
    INdimbalToken public immutable token; // ERC-7984 confidential settlement token
    address public admin;

    uint256 public round;           // current round id
    uint64 public roundDuration;    // seconds between draws
    uint64 public lockWindow;       // no new deposits in the last `lockWindow` seconds (anti-snipe)
    uint64 public roundStart;

    mapping(address => euint64) private _balance;     // encrypted principal per saver
    mapping(address => euint64) private _giveBackPct; // encrypted solidarity dial, 0..100 (default 0)
    mapping(address => bool) public isParticipant;
    address[] public participants;

    // --- "Tanti caché" — anonymous sponsorship (a saver privately routes part of a win to a member) ---
    mapping(address => euint64) private _sponsorIdx;    // encrypted (participant index + 1); 0 = nobody
    mapping(address => euint64) private _sponsorPct;    // encrypted 0..100: share of net winnings to route
    mapping(address => euint64) private _sponsoredWon;  // encrypted winnings routed TO this member by others

    euint64 private _prizePot;      // encrypted prize funded for the current round
    euint64 private _communityFund; // encrypted accrued donations

    mapping(uint256 => bool) public drawn;                        // one draw per round
    mapping(uint256 => mapping(address => ebool)) private _won;   // round => saver => encrypted win flag
    mapping(uint256 => mapping(address => euint64)) private _claimable;

    // Snapshots taken AT DRAW time so a winner can't reduce their pledged generosity after the fact
    // (anti front-running): the give-back % and the sponsorship (index + %) are frozen per round.
    mapping(uint256 => mapping(address => euint64)) private _giveBackAt;
    mapping(uint256 => mapping(address => euint64)) private _sIdxAt;
    mapping(uint256 => mapping(address => euint64)) private _sPctAt;

    // --- reentrancy guard (external confidential-token calls) ---
    uint256 private _guard = 1;
    modifier nonReentrant() {
        require(_guard == 1, "reentrant");
        _guard = 2;
        _;
        _guard = 1;
    }

    event Deposited(address indexed saver);
    event Withdrawn(address indexed saver);
    event GiveBackSet(address indexed saver);
    event PrizeFunded(address indexed from);
    event DrawExecuted(uint256 indexed round, uint256 participantCount);
    event PrizeClaimed(uint256 indexed round, address indexed claimant);
    event CommunityFundSwept(address indexed to);
    event SponsorshipSet(address indexed sponsor);
    event SponsoredClaimed(address indexed beneficiary);

    constructor(INdimbalToken _token, uint64 _roundDuration, uint64 _lockWindow) {
        require(_lockWindow < _roundDuration, "lock >= duration");
        token = _token;
        admin = msg.sender;
        roundDuration = _roundDuration;
        lockWindow = _lockWindow;
        roundStart = uint64(block.timestamp);
        _prizePot = FHE.asEuint64(0);
        _communityFund = FHE.asEuint64(0);
        FHE.allowThis(_prizePot);
        FHE.allowThis(_communityFund);
    }

    // ------------------------------------------------------------------ helpers
    function _bal(address a) internal returns (euint64 b) {
        b = _balance[a];
        if (!FHE.isInitialized(b)) b = FHE.asEuint64(0);
    }

    function _pct(address a) internal returns (euint64 p) {
        p = _giveBackPct[a];
        if (!FHE.isInitialized(p)) p = FHE.asEuint64(0);
    }

    function _sIdx(address a) internal returns (euint64 v) {
        v = _sponsorIdx[a];
        if (!FHE.isInitialized(v)) v = FHE.asEuint64(0);
    }

    function _sPct(address a) internal returns (euint64 v) {
        v = _sponsorPct[a];
        if (!FHE.isInitialized(v)) v = FHE.asEuint64(0);
    }

    function _sWon(address a) internal returns (euint64 v) {
        v = _sponsoredWon[a];
        if (!FHE.isInitialized(v)) v = FHE.asEuint64(0);
    }

    function _register(address a) internal {
        if (!isParticipant[a]) {
            isParticipant[a] = true;
            participants.push(a);
        }
    }

    /// @notice True while deposits are open (locked in the final `lockWindow` before a draw).
    function depositsOpen() public view returns (bool) {
        return block.timestamp + lockWindow <= roundStart + roundDuration;
    }

    // ------------------------------------------------------------------ savers
    /// @notice Deposit a confidential amount. Principal stays yours (withdraw any time).
    /// @dev    Saver must have called `token.setOperator(thisPool, until)` first.
    function deposit(externalEuint64 encAmount, bytes calldata inputProof) external nonReentrant {
        require(depositsOpen(), "deposits locked before draw");
        euint64 amt = FHE.fromExternal(encAmount, inputProof); // pool imports (binding matches saver)
        FHE.allowTransient(amt, address(token));               // let the token move this handle
        euint64 got = token.confidentialTransferFrom(msg.sender, address(this), amt);
        euint64 nb = FHE.add(_bal(msg.sender), got);
        _balance[msg.sender] = nb;
        FHE.allowThis(nb);
        FHE.allow(nb, msg.sender);
        _register(msg.sender);
        emit Deposited(msg.sender);
    }

    /// @notice Privately set the share (0..100 %) of a future win you would give back to the community.
    function setGiveBack(externalEuint64 encPct, bytes calldata inputProof) external {
        euint64 pct = FHE.fromExternal(encPct, inputProof);
        pct = FHE.min(pct, FHE.asEuint64(100)); // clamp to 100 %
        _giveBackPct[msg.sender] = pct;
        FHE.allowThis(pct);
        FHE.allow(pct, msg.sender);
        emit GiveBackSet(msg.sender);
    }

    /// @notice "Tanti caché" — privately name another member (by their `participant index + 1`) to
    ///         receive a private `pct`% share of YOUR net winnings if you win. Nobody — not even the
    ///         beneficiary — learns you chose them; only they can later withdraw what they received,
    ///         and only in aggregate. Encode index+1 and pct in a SINGLE encrypted input (two add64,
    ///         one proof). Set index to 0 (or pct to 0) to disable. Only possible with FHE.
    function setSponsorship(externalEuint64 encIndexPlus1, externalEuint64 encPct, bytes calldata inputProof)
        external
    {
        euint64 idx = FHE.fromExternal(encIndexPlus1, inputProof);
        euint64 pct = FHE.min(FHE.fromExternal(encPct, inputProof), FHE.asEuint64(100)); // clamp to 100 %
        _sponsorIdx[msg.sender] = idx;
        _sponsorPct[msg.sender] = pct;
        FHE.allowThis(idx);
        FHE.allow(idx, msg.sender);
        FHE.allowThis(pct);
        FHE.allow(pct, msg.sender);
        emit SponsorshipSet(msg.sender);
    }

    /// @notice Withdraw part (or all) of your principal at any time. NO LOSS — always allowed.
    function withdraw(externalEuint64 encAmount, bytes calldata inputProof) external nonReentrant {
        euint64 want = FHE.fromExternal(encAmount, inputProof);
        euint64 send = FHE.min(want, _bal(msg.sender)); // never more than the balance
        euint64 nb = FHE.sub(_bal(msg.sender), send);
        _balance[msg.sender] = nb;
        FHE.allowThis(nb);
        FHE.allow(nb, msg.sender);
        FHE.allowTransient(send, address(token));
        token.confidentialTransfer(msg.sender, send);
        emit Withdrawn(msg.sender);
    }

    // ------------------------------------------------------------------ prize (yield source)
    /// @notice Fund the current round's prize with a confidential amount (yield source or sponsor).
    ///         A sponsor can fund the pool without ever seeing a balance or the winner.
    function fundPrize(externalEuint64 encAmount, bytes calldata inputProof) external nonReentrant {
        euint64 amt = FHE.fromExternal(encAmount, inputProof);
        FHE.allowTransient(amt, address(token));
        euint64 got = token.confidentialTransferFrom(msg.sender, address(this), amt);
        _prizePot = FHE.add(_prizePot, got);
        FHE.allowThis(_prizePot);
        emit PrizeFunded(msg.sender);
    }

    // ------------------------------------------------------------------ the draw
    /// @notice Execute the periodic draw. Winner = encrypted argmax of `balance × protocol-random`.
    ///         Total pool, every balance and every ticket stay encrypted; each saver gets an encrypted
    ///         flag only they can decrypt. Randomness is protocol-provided (unbiasable, un-grindable).
    function draw() external {
        require(block.timestamp >= roundStart + roundDuration, "round not over");
        uint256 r = round;
        require(!drawn[r], "already drawn");
        uint256 n = participants.length;
        require(n > 0, "no participants");
        drawn[r] = true;

        // Ticket math is done in euint128: balance(euint64) × rand(euint32) can reach ~2^96,
        // which would overflow euint64. Widening to euint128 keeps the weighting exact even for
        // very large cumulative pools. Balances/prize/fund stay euint64 (ample for real amounts).
        euint128[] memory tickets = new euint128[](n);
        euint128 maxTicket = FHE.asEuint128(0);

        // pass 1: weighted encrypted tickets + running encrypted max
        for (uint256 i = 0; i < n; i++) {
            euint32 rnd = FHE.randEuint32();                                            // protocol randomness
            euint128 t = FHE.mul(FHE.asEuint128(_bal(participants[i])), FHE.asEuint128(rnd)); // ticket = balance × random
            tickets[i] = t;
            maxTicket = FHE.max(maxTicket, t);
        }

        // pass 2: encrypted win flag + claimable prize (full pot to the winner)
        for (uint256 i = 0; i < n; i++) {
            address p = participants[i];
            ebool won = FHE.eq(tickets[i], maxTicket);
            euint64 c = FHE.select(won, _prizePot, FHE.asEuint64(0));
            _won[r][p] = won;
            _claimable[r][p] = c;
            FHE.allowThis(won);
            FHE.allow(won, p);   // only the saver can learn if they won
            FHE.allowThis(c);
            FHE.allow(c, p);

            // freeze the generosity choices for this round (anti front-running)
            euint64 gb = _pct(p);
            euint64 si = _sIdx(p);
            euint64 sp = _sPct(p);
            _giveBackAt[r][p] = gb;
            _sIdxAt[r][p] = si;
            _sPctAt[r][p] = sp;
            FHE.allowThis(gb);
            FHE.allowThis(si);
            FHE.allowThis(sp);
        }

        round = r + 1;
        roundStart = uint64(block.timestamp);
        _prizePot = FHE.asEuint64(0); // reset for next round
        FHE.allowThis(_prizePot);
        emit DrawExecuted(r, n);
    }

    /// @notice Claim your prize for round `r`. If you didn't win, this moves 0 (harmless). Your private
    ///         give-back % goes to the community fund; your private "Tanti caché" sponsorship routes a
    ///         further share to a member you chose in secret; the rest is yours — all on encrypted
    ///         values, so nobody sees your generosity or who you supported.
    function claim(uint256 r) external nonReentrant {
        euint64 c = _claimable[r][msg.sender];
        require(FHE.isInitialized(c), "nothing to claim");

        // Generosity choices are read from the round SNAPSHOT (frozen at draw), not the live values,
        // so a winner cannot lower their give-back or sponsorship after learning they won.
        // 1) community give-back
        euint64 community = FHE.div(FHE.mul(c, _giveBackAt[r][msg.sender]), uint64(100)); // c × pct / 100
        euint64 net = FHE.sub(c, community);

        // 2) anonymous sponsorship: route sPct% of the remainder to a privately-chosen member.
        //    The credit loop touches every member, so nobody can tell who was chosen.
        euint64 sponsorAmt = FHE.div(FHE.mul(net, _sPctAt[r][msg.sender]), uint64(100));
        euint64 userGets = FHE.sub(net, sponsorAmt);

        euint64 benIdx = _sIdxAt[r][msg.sender];
        uint256 n = participants.length;
        for (uint256 j = 0; j < n; j++) {
            address p = participants[j];
            ebool hit = FHE.eq(benIdx, FHE.asEuint64(uint64(j + 1))); // index+1 encoding; 0 = nobody
            euint64 credited = FHE.add(_sWon(p), FHE.select(hit, sponsorAmt, FHE.asEuint64(0)));
            _sponsoredWon[p] = credited;
            FHE.allowThis(credited);
            FHE.allow(credited, p); // only the beneficiary can read/withdraw their routed winnings
        }

        _communityFund = FHE.add(_communityFund, community);
        FHE.allowThis(_communityFund);

        _claimable[r][msg.sender] = FHE.asEuint64(0); // prevent double-claim
        FHE.allowThis(_claimable[r][msg.sender]);

        FHE.allowTransient(userGets, address(token));
        token.confidentialTransfer(msg.sender, userGets);
        emit PrizeClaimed(r, msg.sender);
    }

    /// @notice Withdraw winnings that other members privately routed to you via "Tanti caché".
    ///         You never learn who sponsored you — only the aggregate amount you can claim.
    function claimSponsored() external nonReentrant {
        euint64 amt = _sWon(msg.sender);
        _sponsoredWon[msg.sender] = FHE.asEuint64(0); // prevent double-claim
        FHE.allowThis(_sponsoredWon[msg.sender]);
        FHE.allowTransient(amt, address(token));
        token.confidentialTransfer(msg.sender, amt);
        emit SponsoredClaimed(msg.sender);
    }

    /// @notice Route the accrued community fund to a cause (governance / admin).
    function sweepCommunityFund(address to) external nonReentrant {
        require(msg.sender == admin, "not admin");
        euint64 amt = _communityFund;
        _communityFund = FHE.asEuint64(0);
        FHE.allowThis(_communityFund);
        FHE.allowTransient(amt, address(token));
        token.confidentialTransfer(to, amt);
        emit CommunityFundSwept(to);
    }

    // ------------------------------------------------------------------ views (ciphertext handles)
    function confidentialBalanceOf(address a) external view returns (euint64) { return _balance[a]; }
    function giveBackOf(address a) external view returns (euint64) { return _giveBackPct[a]; }
    function sponsoredWonOf(address a) external view returns (euint64) { return _sponsoredWon[a]; }
    function didWin(uint256 r, address a) external view returns (ebool) { return _won[r][a]; }
    function claimableOf(uint256 r, address a) external view returns (euint64) { return _claimable[r][a]; }
    function participantCount() external view returns (uint256) { return participants.length; }
    function roundEnd() external view returns (uint64) { return roundStart + roundDuration; }
}
