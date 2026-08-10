// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, euint16, euint64, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {INdimbalToken} from "./INdimbalToken.sol";
import {IConfidentialVault} from "./IConfidentialVault.sol";

/// @title NDIMBAL — the no-loss prize-savings pool where winning lifts the whole community, privately
/// @author El Hadji Pape Alamine Sarr (Kaddu) — Zama Developer Program, Mainnet Season 4
/// @notice A confidential "PoolTogether": savers deposit a confidential token (ERC-7984, e.g. cUSDC),
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
/// @dev    Prize = REAL YIELD: `fundVault` routes confidential capital into a yield vault (`IConfidentialVault`
///         — a Sepolia mock of, or the real mainnet, Steakhouse Confidential Prime USDC vault on Morpho) and
///         `harvestYield` skims only the earned yield into the pot. A manual `fundPrize` (sponsor path) also
///         remains. Ticket = `min(balance, 2^39) × randEuint16` kept in **euint64**; the winner is the
///         encrypted argmax found by a **tree reduction** (O(log n) depth), so the pool scales past a linear
///         fold's per-transaction HCU limit. Target chain: Sepolia.
contract NdimbalPool is ZamaEthereumConfig {
    INdimbalToken public immutable token; // ERC-7984 confidential settlement token

    // --- yield source (Morpho) — the prize is GENERATED, not hand-injected ---
    // Confidential yield vault the pool routes idle capital through. address(0) = yield disabled (manual
    // fundPrize only). On Sepolia this is MockConfidentialVault; on mainnet, the real Steakhouse Confidential
    // Prime USDC vault (cUSDC 0xe978…72B2) — same IConfidentialVault interface, only the address differs.
    IConfidentialVault public immutable yieldVault;
    euint64 private _vaultPrincipal; // encrypted principal placed in the vault; harvested yield = position - this
    // Where the aggregate community fund can be swept — FIXED at deploy, never changeable. There is no
    // admin key and no arbitrary destination, so the pool has no centralised point that can divert funds.
    address public immutable communityBeneficiary;

    uint256 public round;           // current round id
    uint64 public roundDuration;    // seconds between draws
    uint64 public lockWindow;       // no new deposits in the last `lockWindow` seconds (anti-snipe)
    uint64 public roundStart;

    mapping(address => euint64) private _balance;     // encrypted principal per saver
    mapping(address => euint64) private _giveBackPct; // encrypted solidarity dial, 0..100 (default 0)
    mapping(address => bool) public isParticipant;
    address[] public participants;
    mapping(address => uint256) private participantIndex; // position in participants[], for O(1) removal on leave()
    // Hard cap on active participants (set at deploy). draw()/claim() are O(n) in FHE ops, so an unbounded list
    // could be inflated by a third party until a draw exceeds the fhEVM per-tx budget. Set conservatively for the
    // op count; savers can leave() to free a slot. (A stake-to-join defence against slot-squatting is on the roadmap.)
    uint256 public immutable MAX_PARTICIPANTS;
    // Prize is clamped so the give-back math (c × pct) can never overflow euint64. 1.8e17 is far above any real prize.
    uint64 public constant MAX_PRIZE = 180_000_000_000_000_000;

    // --- "Tanti caché" — anonymous sponsorship (a saver privately routes part of a win to a member) ---
    mapping(address => euint64) private _sponsorIdx;    // encrypted (participant index + 1); 0 = nobody
    mapping(address => euint64) private _sponsorPct;    // encrypted 0..100: share of net winnings to route
    mapping(address => euint64) private _sponsoredWon;  // encrypted winnings routed TO this member by others

    euint64 private _prizePot;      // encrypted prize funded for the current round
    euint64 private _communityFund; // encrypted accrued donations

    mapping(uint256 => bool) public drawn;                        // one draw per round
    mapping(uint256 => address[]) private _participantsAt;        // participant list frozen at draw time (per round)
    // BATCHED draw (scales the pool past the per-tx HCU limit): the draw is processed in small batches spread
    // over several transactions — `drawTickets(batch)` computes tickets + a running max, then
    // `drawWinners(batch)` computes win flags + a running "anyone won?". Each tx stays under the fhEVM HCU
    // budget, so `MAX_PARTICIPANTS` can be far larger than a single-tx draw allows.
    mapping(uint256 => euint64[]) private _ticketsAt; // tickets accumulated by drawTickets, read by drawWinners
    mapping(uint256 => euint64) private _maxAt;       // running encrypted max ticket
    mapping(uint256 => ebool) private _anyWonAt;      // running "did anyone win?" (for the rollover)
    mapping(uint256 => uint256) public ticketDone;    // participants whose tickets are computed
    mapping(uint256 => uint256) public winDone;       // participants whose win flag is computed
    mapping(uint256 => uint8) public drawPhase;       // 0 = none, 1 = ticketing, 2 = tickets done, 3 = drawn
    mapping(uint256 => mapping(address => ebool)) private _won;   // round => saver => encrypted win flag
    mapping(uint256 => mapping(address => euint64)) private _claimable;
    mapping(uint256 => mapping(address => bool)) private claimed; // one claim per saver per round; private so it leaks no "who claimed" metadata

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
    event DrawStarted(uint256 indexed round, uint256 participantCount); // drawPart1 completed
    event DrawExecuted(uint256 indexed round, uint256 participantCount);
    event PrizeClaimed(uint256 indexed round, address indexed claimant);
    event CommunityFundSwept(address indexed to);
    event SponsorshipSet(address indexed sponsor);
    event SponsoredClaimed(address indexed beneficiary);
    event VaultFunded(address indexed from); // capital routed into the yield vault
    event YieldHarvested();                   // vault yield skimmed into the prize

    constructor(
        INdimbalToken _token,
        uint64 _roundDuration,
        uint64 _lockWindow,
        uint256 _maxParticipants,
        address _communityBeneficiary,
        address _yieldVault
    ) {
        require(_lockWindow < _roundDuration, "lock >= duration");
        require(_maxParticipants > 0, "max=0");
        require(_maxParticipants < 256, "max>=256"); // hard upper bound (well above the HCU-proven cap)
        require(_communityBeneficiary != address(0), "beneficiary=0");
        token = _token;
        communityBeneficiary = _communityBeneficiary; // immutable: the community fund can only ever go here
        yieldVault = IConfidentialVault(_yieldVault); // address(0) = yield disabled (manual fundPrize only)
        roundDuration = _roundDuration;
        lockWindow = _lockWindow;
        MAX_PARTICIPANTS = _maxParticipants;
        roundStart = uint64(block.timestamp);
        _prizePot = FHE.asEuint64(0);
        _communityFund = FHE.asEuint64(0);
        _vaultPrincipal = FHE.asEuint64(0);
        FHE.allowThis(_prizePot);
        FHE.allowThis(_communityFund);
        FHE.allowThis(_vaultPrincipal);
        // Let the vault pull this pool's tokens when we route capital into it (ERC-7984 operator flow).
        if (_yieldVault != address(0)) token.setOperator(_yieldVault, type(uint48).max);
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
            require(participants.length < MAX_PARTICIPANTS, "pool full");
            isParticipant[a] = true;
            participantIndex[a] = participants.length;
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

    /// @notice Withdraw your ENTIRE balance and leave the pool, freeing your participant slot. FHE can't
    ///         observe an encrypted-zero balance, so purging is voluntary — this is the explicit exit path
    ///         (it keeps draw()/claim() cheap and lets honest churn free capped slots).
    /// @dev    Removal reindexes participants[] (swap-pop). The draw freezes the participant list, so this
    ///         can no longer redirect a sponsorship AFTER a draw. It can still shift positions BEFORE a
    ///         draw: a "Tanti caché" index set by position may then point at whoever was swapped into that
    ///         slot. Sponsorship-by-index is therefore best-effort and re-settable until the draw; a
    ///         per-address (not per-index) encoding is on the roadmap to close the pre-draw window too.
    function leave() external nonReentrant {
        require(isParticipant[msg.sender], "not in pool");
        euint64 bal = _bal(msg.sender);
        // effects first (CEI): zero the balance, then swap-pop out of participants[]
        _balance[msg.sender] = FHE.asEuint64(0);
        FHE.allowThis(_balance[msg.sender]);
        FHE.allow(_balance[msg.sender], msg.sender);
        uint256 idx = participantIndex[msg.sender];
        uint256 last = participants.length - 1;
        if (idx != last) {
            address moved = participants[last];
            participants[idx] = moved;
            participantIndex[moved] = idx;
        }
        participants.pop();
        delete participantIndex[msg.sender];
        isParticipant[msg.sender] = false;
        // interaction last
        FHE.allowTransient(bal, address(token));
        token.confidentialTransfer(msg.sender, bal);
        emit Withdrawn(msg.sender);
    }

    // ------------------------------------------------------------------ prize (yield source)
    /// @notice Fund the current round's prize with a confidential amount (yield source or sponsor).
    ///         A sponsor can fund the pool without ever seeing a balance or the winner.
    function fundPrize(externalEuint64 encAmount, bytes calldata inputProof) external nonReentrant {
        euint64 amt = FHE.fromExternal(encAmount, inputProof);
        FHE.allowTransient(amt, address(token));
        euint64 got = token.confidentialTransferFrom(msg.sender, address(this), amt);
        // Clamp the INCOMING amount BEFORE adding, so the euint64 sum can never wrap. If we added first
        // (`_prizePot + got`), a `got` near 2^64 would wrap the sum down to a small value — `FHE.min` would
        // pass it through, `excess` would be 0, and the whole deposit would be silently absorbed with NO
        // refund (exactly the case the refund is meant to cover). `_prizePot <= MAX_PRIZE` always holds by
        // construction, so `headroom` never underflows and `_prizePot + accepted <= MAX_PRIZE` never overflows.
        euint64 headroom = FHE.sub(FHE.asEuint64(MAX_PRIZE), _prizePot); // MAX_PRIZE - _prizePot (>= 0)
        euint64 accepted = FHE.min(got, headroom);                       // the part that fits under the cap
        euint64 excess = FHE.sub(got, accepted);                         // the rest is REFUNDED, never absorbed
        _prizePot = FHE.add(_prizePot, accepted);
        FHE.allowThis(_prizePot);
        FHE.allowTransient(excess, address(token));
        token.confidentialTransfer(msg.sender, excess);
        emit PrizeFunded(msg.sender);
    }

    // ------------------------------------------------------------------ real yield (Morpho)
    /// @notice Route confidential capital into the yield vault. The caller supplies the amount; it is pulled
    ///         into the pool, deposited into the vault, and the pool's principal is tracked so `harvestYield()`
    ///         can later skim only the yield. This is what makes the prize GENERATED (from a live DeFi strategy)
    ///         rather than hand-injected by a sponsor. The caller must have set this pool as a token operator.
    /// @dev    On Sepolia the vault is a mock; on mainnet it is the real Steakhouse Confidential Prime USDC
    ///         vault on Morpho. Nothing here ever leaks a balance — the amount placed stays encrypted.
    function fundVault(externalEuint64 encAmount, bytes calldata inputProof) external nonReentrant {
        require(address(yieldVault) != address(0), "no vault");
        euint64 amt = FHE.fromExternal(encAmount, inputProof);
        FHE.allowTransient(amt, address(token));
        euint64 got = token.confidentialTransferFrom(msg.sender, address(this), amt); // caller -> pool
        FHE.allowTransient(got, address(yieldVault));
        euint64 placed = yieldVault.deposit(got);                                     // pool -> vault
        _vaultPrincipal = FHE.add(_vaultPrincipal, placed);
        FHE.allowThis(_vaultPrincipal);
        emit VaultFunded(msg.sender);
    }

    /// @notice Skim the yield the vault earned (position − principal) into the current round's prize.
    ///         Permissionless — the destination (the prize pot) is not a choice. Principal stays invested and
    ///         keeps earning. If the vault ever lost value (position < principal), yield is exactly zero: it
    ///         never underflows and never touches principal. This is the line that turns NDIMBAL from a
    ///         sponsor-funded demo into a real yield system.
    function harvestYield() external nonReentrant {
        require(address(yieldVault) != address(0), "no vault");
        euint64 pos = yieldVault.confidentialBalanceOf(address(this));
        ebool gain = FHE.gt(pos, _vaultPrincipal);
        euint64 yieldAmt = FHE.select(gain, FHE.sub(pos, _vaultPrincipal), FHE.asEuint64(0)); // max(pos-principal, 0)
        FHE.allowTransient(yieldAmt, address(yieldVault));
        euint64 got = yieldVault.redeem(yieldAmt); // vault -> pool: only the yield, principal stays invested
        // Add to the prize under the same overflow-safe cap as fundPrize.
        euint64 headroom = FHE.sub(FHE.asEuint64(MAX_PRIZE), _prizePot);
        euint64 accepted = FHE.min(got, headroom);
        _prizePot = FHE.add(_prizePot, accepted);
        FHE.allowThis(_prizePot);
        emit YieldHarvested();
    }

    // ------------------------------------------------------------------ the draw
    // Pairwise TREE reductions: fold an array with FHE.max / FHE.or in ceil(log2(n)) sequential levels
    // instead of n. The fhEVM caps the *sequential depth* of FHE ops per transaction
    // (HCUTransactionDepthLimitExceeded); a linear fold's depth grows with n and caps the pool at ~3, while a
    // tree's depth grows with log2(n), letting the same op count fit far larger pools. Results are identical
    // (max and or are associative). Both helpers overwrite the passed array in place.
    function _maxTree(euint64[] memory a, uint256 len) internal returns (euint64) {
        while (len > 1) {
            uint256 half = (len + 1) / 2;
            for (uint256 i = 0; i < half; i++) {
                a[i] = (2 * i + 1 < len) ? FHE.max(a[2 * i], a[2 * i + 1]) : a[2 * i];
            }
            len = half;
        }
        return a[0];
    }
    function _orTree(ebool[] memory a, uint256 len) internal returns (ebool) {
        while (len > 1) {
            uint256 half = (len + 1) / 2;
            for (uint256 i = 0; i < half; i++) {
                a[i] = (2 * i + 1 < len) ? FHE.or(a[2 * i], a[2 * i + 1]) : a[2 * i];
            }
            len = half;
        }
        return a[0];
    }

    /// @notice Execute the periodic draw. Winner = encrypted argmax of `balance × protocol-random`.
    ///         Total pool, every balance and every ticket stay encrypted; each saver gets an encrypted
    ///         flag only they can decrypt. Randomness is protocol-provided (unbiasable, un-grindable).
    function draw() external {
        require(block.timestamp >= roundStart + roundDuration, "round not over");
        uint256 r = round;
        require(!drawn[r], "already drawn");
        uint256 n = participants.length;
        drawn[r] = true;

        // Empty round: the pool is empty (e.g. everyone used leave()). We advance the clock and return
        // instead of reverting. Reverting here was the "leave() deadlock": roundStart only moves inside
        // draw(), so a stuck draw() would revert forever and freeze every future round. The funded prize
        // just rolls over untouched to the next round.
        if (n == 0) {
            round = r + 1;
            roundStart = uint64(block.timestamp);
            emit DrawExecuted(r, 0);
            return;
        }

        // Freeze the participant list for this round so claim() credits the exact people who were in the
        // pool AT the draw. Without this, a leave() between draw and claim reindexes participants[] and a
        // frozen "Tanti caché" index would credit whoever got swapped into that slot (see claim()).
        _participantsAt[r] = participants;

        // Tickets are euint64 (roughly half the HCU of euint128, so many more savers fit under the fhEVM's
        // per-transaction HCU budget). To stay inside 64 bits we cap the effective balance and use a 16-bit
        // random: ticket = min(balance, 2^39) × rand(2^16) ≤ 2^55, then (<< 8 | index) ≤ 2^63 — no overflow,
        // still strictly weighted by deposit. The cap (~5.5×10^11 base units) is far above any realistic prize
        // pool; a saver above it is simply weighted as if at the cap. Documented in the README.
        euint64[] memory tickets = new euint64[](n);
        euint64 balCap = FHE.asEuint64(uint64(1) << 39);

        // pass 1: weighted encrypted tickets — each INDEPENDENT (no sequential running max, so pass-1 depth
        // no longer grows with n).
        for (uint256 i = 0; i < n; i++) {
            euint16 rnd = FHE.randEuint16();                                            // protocol randomness
            // Strictly-unique ticket: (cappedBalance × random) shifted up 8 bits, with the public loop index in
            // the low bits, so two non-zero tickets can NEVER be exactly equal — which would otherwise let two
            // savers "win" the same round and each claim the full pot (breaking the no-loss guarantee).
            euint64 t = FHE.mul(FHE.min(_bal(participants[i]), balCap), FHE.asEuint64(rnd)); // ≤ 2^55
            t = FHE.add(FHE.mul(t, FHE.asEuint64(256)), FHE.asEuint64(uint64(n - i)));       // (t << 8) | (n - i)
            tickets[i] = t;
        }
        // encrypted max via a TREE reduction (log2(n) sequential depth). Reduce a COPY so tickets[] stays
        // intact for the win-flag comparison in pass 2.
        euint64 maxTicket;
        {
            euint64[] memory work = new euint64[](n);
            for (uint256 i = 0; i < n; i++) work[i] = tickets[i];
            maxTicket = _maxTree(work, n);
        }

        // pass 2: encrypted win flag + claimable prize (full pot to the winner). Flags are collected into an
        // array and OR-reduced by a tree afterwards, so pass-2 depth no longer grows with n either.
        ebool[] memory wonArr = new ebool[](n);
        for (uint256 i = 0; i < n; i++) {
            address p = participants[i];
            // Guard: a saver with a zero balance (deposited then withdrew everything, but still
            // listed in participants[]) must never win. Without this, if the whole pool sits at zero
            // while a prize is funded, every ticket == 0 == maxTicket and everyone would "win" — the
            // pot could then be claimed several times. With the guard, nobody wins and the prize
            // rolls over to the next round. This also neutralises the (astronomically rare) exact tie.
            ebool won = FHE.and(
                FHE.eq(tickets[i], maxTicket),
                FHE.gt(_bal(p), FHE.asEuint64(0))
            );
            wonArr[i] = won;
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

        // OR-reduce the win flags with a tree (log2(n) depth) → "did anyone win this round?"
        ebool anyWon = _orTree(wonArr, n);

        round = r + 1;
        roundStart = uint64(block.timestamp);
        // Roll the prize over: only zero the pot if someone actually won; otherwise it carries to next round
        // (matches the documented behaviour — a no-winner round must not burn the funded prize).
        _prizePot = FHE.select(anyWon, FHE.asEuint64(0), _prizePot);
        FHE.allowThis(_prizePot);
        emit DrawExecuted(r, n);
    }

    // ------------------------------------------- BATCHED draw (scales the pool past the single-tx HCU limit)
    /// @notice Phase 1, batched: compute the encrypted tickets for the next `batch` savers and fold them into a
    ///         running max. Call repeatedly (any batch that fits a tx — e.g. 8) until `drawPhase == 2`, then run
    ///         `drawWinners`. The first call freezes the round; an empty pool finishes here.
    function drawTickets(uint256 batch) external {
        uint256 r = round;
        uint256 n = participants.length;
        if (drawPhase[r] == 0) {
            require(block.timestamp >= roundStart + roundDuration, "round not over");
            if (n == 0) { // empty round: finish immediately and advance the clock
                drawPhase[r] = 3;
                drawn[r] = true;
                round = r + 1;
                roundStart = uint64(block.timestamp);
                emit DrawExecuted(r, 0);
                return;
            }
            _participantsAt[r] = participants; // freeze the participant list for the whole draw
            drawPhase[r] = 1;
        }
        require(drawPhase[r] == 1, "not in ticketing phase");
        require(batch > 0, "batch=0");
        uint256 done = ticketDone[r];
        uint256 end = done + batch;
        if (end > n) end = n;
        euint64 balCap = FHE.asEuint64(uint64(1) << 39);
        euint64[] memory bt = new euint64[](end - done);
        for (uint256 i = done; i < end; i++) {
            euint16 rnd = FHE.randEuint16();
            euint64 t = FHE.mul(FHE.min(_bal(participants[i]), balCap), FHE.asEuint64(rnd));
            t = FHE.add(FHE.mul(t, FHE.asEuint64(256)), FHE.asEuint64(uint64(n - i)));
            FHE.allowThis(t); // persist ACL so drawWinners (a later tx) can compare it to the max
            _ticketsAt[r].push(t);
            bt[i - done] = t;
        }
        // batch-local max (tree, log2(batch) depth) folded into the running global max
        euint64 batchMax = _maxTree(bt, end - done);
        _maxAt[r] = (done == 0) ? batchMax : FHE.max(_maxAt[r], batchMax);
        FHE.allowThis(_maxAt[r]);
        ticketDone[r] = end;
        if (end == n) drawPhase[r] = 2; // all tickets done → ready for the winner phase
        emit DrawStarted(r, end);
    }

    /// @notice Phase 2, batched: for the next `batch` savers, compute the encrypted win flag + claimable prize,
    ///         snapshot generosity, and fold into a running "did anyone win?". Call repeatedly until all savers
    ///         are processed; the final call rolls the prize over (if nobody won) and advances the round.
    function drawWinners(uint256 batch) external {
        uint256 r = round;
        require(drawPhase[r] == 2, "tickets not done");
        require(batch > 0, "batch=0");
        address[] storage plist = _participantsAt[r];
        uint256 n = plist.length;
        euint64 maxTicket = _maxAt[r];
        uint256 done = winDone[r];
        uint256 end = done + batch;
        if (end > n) end = n;
        ebool[] memory bw = new ebool[](end - done);
        for (uint256 i = done; i < end; i++) {
            address p = plist[i];
            // zero-balance guard: an emptied account can never win (see the single-tx draw for the rationale).
            ebool won = FHE.and(FHE.eq(_ticketsAt[r][i], maxTicket), FHE.gt(_bal(p), FHE.asEuint64(0)));
            bw[i - done] = won;
            euint64 c = FHE.select(won, _prizePot, FHE.asEuint64(0));
            _won[r][p] = won;
            _claimable[r][p] = c;
            FHE.allowThis(won);
            FHE.allow(won, p);
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
        ebool batchAny = _orTree(bw, end - done);
        _anyWonAt[r] = (done == 0) ? batchAny : FHE.or(_anyWonAt[r], batchAny);
        FHE.allowThis(_anyWonAt[r]);
        winDone[r] = end;
        if (end == n) { // last batch → finalise the round
            round = r + 1;
            roundStart = uint64(block.timestamp);
            drawn[r] = true;
            drawPhase[r] = 3;
            _prizePot = FHE.select(_anyWonAt[r], FHE.asEuint64(0), _prizePot);
            FHE.allowThis(_prizePot);
            emit DrawExecuted(r, n);
        }
    }

    /// @notice Claim your prize for round `r`. If you didn't win, this moves 0 (harmless). Your private
    ///         give-back % goes to the community fund; your private "Tanti caché" sponsorship routes a
    ///         further share to a member you chose in secret; the rest is yours — all on encrypted
    ///         values, so nobody sees your generosity or who you supported.
    function claim(uint256 r) external nonReentrant {
        // A trivially-encrypted 0 still passes FHE.isInitialized, so zeroing _claimable is NOT enough to
        // block a re-call (which would re-run the O(n) sponsorship loop). This plaintext flag is the real lock.
        require(!claimed[r][msg.sender], "already claimed");
        euint64 c = _claimable[r][msg.sender];
        require(FHE.isInitialized(c), "nothing to claim");
        claimed[r][msg.sender] = true;

        // Generosity choices are read from the round SNAPSHOT (frozen at draw), not the live values,
        // so a winner cannot lower their give-back or sponsorship after learning they won.
        // 1) community give-back. Kept in euint64 on purpose: widening this path to euint128 pushes claim()
        //    past the fhEVM HCU / circuit-depth budget for one transaction (the O(n) sponsorship loop already
        //    dominates the cost). euint64 is safe for prize amounts up to ~1.8e17 — orders of magnitude above
        //    any realistic cUSDC prize. This bound is documented as a known limit in the README.
        euint64 community = FHE.div(FHE.mul(c, _giveBackAt[r][msg.sender]), uint64(100)); // c × pct / 100
        euint64 net = FHE.sub(c, community);

        // 2) anonymous sponsorship: route sPct% of the remainder to a privately-chosen member.
        //    The credit loop touches every member, so nobody can tell who was chosen.
        euint64 sponsorAmt = FHE.div(FHE.mul(net, _sPctAt[r][msg.sender]), uint64(100));
        euint64 userGets = FHE.sub(net, sponsorAmt);

        euint64 benIdx = _sIdxAt[r][msg.sender];
        // Iterate the FROZEN participant list for round r, not the live one. This closes the draw->claim
        // window: a leave() after the draw can no longer swap a different address into the position the
        // sponsor privately chose, so the credit always lands on the member who held that index at draw.
        address[] storage snap = _participantsAt[r];
        uint256 n = snap.length;
        for (uint256 j = 0; j < n; j++) {
            address p = snap[j];
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

    /// @notice Sweep the accrued community fund to the IMMUTABLE beneficiary fixed at deploy. Deliberately
    ///         permissionless — anyone may trigger it, because the destination is not a choice: there is no
    ///         admin key and no arbitrary `to`, so this can never be used to divert funds. This removes the
    ///         contract's only centralised trust point (the previous single-admin, free-`to` sweep).
    function sweepCommunityFund() external nonReentrant {
        euint64 amt = _communityFund;
        _communityFund = FHE.asEuint64(0);
        FHE.allowThis(_communityFund);
        FHE.allowTransient(amt, address(token));
        token.confidentialTransfer(communityBeneficiary, amt);
        emit CommunityFundSwept(communityBeneficiary);
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
