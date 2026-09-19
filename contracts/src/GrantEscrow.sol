// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IERC20Permit} from "./interfaces/IERC20Permit.sol";
import {SafeToken} from "./lib/SafeToken.sol";

/// @title GrantEscrow
/// @notice A grant of ownership that vests on a schedule, out of an escrow the payer
///         cannot reach into.
///
/// @dev WHY THE ESCROW HOLDS THE ASSET AND NOT THE STABLECOIN.
///
///      The alternative — hold stablecoin, swap a slice at each vest — needs router
///      calldata at vest time. `vest` is permissionless by design, so whoever calls it
///      would choose `minOut`, and a caller who sets it low can sandwich their own vest
///      and take the difference from the beneficiary. There is no oracle here to bound
///      that against, and posting one is explicitly not the design.
///
///      Holding the asset removes the question. The swap happens ONCE, at `open`, bounded
///      by a `minOut` the payer signed for, exactly as a payment is. After that a grant is
///      denominated in units and a vest is a transfer: nothing to route, nothing to price,
///      nothing for a hostile caller to gain. It is also what a grant actually is — a
///      number of units vesting over time, not a promise to go shopping later.
///
///      THE KEEPER'S TIP CANNOT BE FARMED. It is a fixed share of what each vest releases,
///      so the tips paid over a grant's whole life sum to at most `tipBps` of it, however
///      many times anyone calls. A vest with nothing due reverts and pays no one.
///
///      WHY A GRANT IS DENOMINATED IN SHARES AND NOT IN UNITS.
///
///      Every xStock on X Layer is an EIP-1967 proxy behind one implementation with one
///      owner, and that implementation carries `mint(address,uint256)` and
///      `burn(address,uint256)`. The issuer can therefore change what this contract holds
///      without a transfer ever touching it, and an upgrade could introduce a rebase.
///
///      Absolute bookkeeping breaks under that: the recorded total goes stale, and the
///      shortfall lands entirely on whoever vests last, as a revert. So each grant holds a
///      SHARE of the pool of its asset. Anything that moves the pool — a rebase, a burn
///      against this address, a corporate action — moves every grant proportionally, which
///      is both fair and incapable of stranding anyone. Units are computed at the moment
///      of release and never stored.
contract GrantEscrow {
    using SafeToken for IERC20;

    enum State {
        None,
        Open,
        Closed
    }

    struct Grant {
        address payer;
        address beneficiary;
        address asset;
        /// @dev This grant's share of the pool of `asset`. Reduced to the vested share
        ///      if revoked. Units are derived from it, never stored.
        uint128 shares;
        /// @dev Shares already converted and delivered, tips included.
        uint128 sharesReleased;
        /// @dev What the payer spent to open it, for the cost basis shown on a grant page.
        uint128 stableCost;
        uint64 start;
        /// @dev Seconds after `start` before anything vests. At the cliff the whole
        ///      elapsed share becomes available at once, as a cliff should.
        uint64 cliff;
        /// @dev Seconds after `start` until fully vested.
        uint64 duration;
        /// @dev The keeper's share of each release, in basis points.
        uint16 tipBps;
        /// @dev The payer has given up the right to revoke. Cannot be undone.
        bool isSealed;
        bool revoked;
        /// @dev Shares vested at the moment of revocation. Vesting is frozen here.
        uint128 frozenVestedShares;
        bytes32 reasonHash;
        State state;
    }

    IERC20 public immutable stable;
    address public immutable router;
    address public immutable routerSpender;

    /**
     * @dev VIRTUAL SHARES, AGAINST THE FIRST-DEPOSITOR INFLATION ATTACK.
     *
     * The pool is priced from `balanceOf`, which is what makes a burn or a rebase by the
     * issuer land on every grant proportionally. It also means anyone can move the pool by
     * sending the asset straight to this contract, without opening a grant at all.
     *
     * Unmitigated, that is the classic vault attack: open a one-wei grant so you hold the
     * only share, donate a large amount to the contract, and the next real grant prices to
     * ZERO shares and reverts. Measured against a real $100 grant, one wei plus a thousand
     * SPYx was enough to deny it.
     *
     * The offset makes shares a millionfold finer than units, so a donation must be about
     * a million times the amount it could extract before the rounding bites — the ratio
     * came out at eighteen million to one in the case above, which is not an attack, it is
     * a gift. A round trip at an empty pool is still exact: deposit D, hold exactly D.
     */
    uint256 private constant SHARE_OFFSET = 1e6;

    /// @dev A keeper taking more than this of every release is not a keeper.
    uint16 public constant MAX_TIP_BPS = 200;
    /// @dev A grant nobody could ever finish is not a grant.
    uint64 public constant MAX_DURATION = 3650 days;

    uint256 public grantCount;
    mapping(uint256 => Grant) private grants;

    /// @notice Shares outstanding against the pool of each asset this contract holds.
    ///         `units = shares * balanceOf(this) / poolShares[asset]`, always computed now.
    mapping(address => uint256) public poolShares;

    event GrantOpened(
        uint256 indexed id,
        address indexed payer,
        address indexed beneficiary,
        address asset,
        uint256 units,
        uint256 shares,
        uint256 stableCost,
        uint64 start,
        uint64 cliff,
        uint64 duration,
        uint16 tipBps,
        bytes32 reasonHash
    );

    event GrantSealed(uint256 indexed id, address indexed payer);

    event Vested(
        uint256 indexed id,
        address indexed beneficiary,
        address indexed caller,
        address asset,
        uint256 unitsToBeneficiary,
        uint256 unitsToCaller,
        uint256 sharesReleased,
        uint256 sharesTotal
    );

    event GrantRevoked(uint256 indexed id, address indexed payer, uint256 vestedUnits, uint256 returnedUnits);
    event GrantClosed(uint256 indexed id, uint256 unused);

    error NoSuchGrant();
    error NotOpen();
    error NotThePayer();
    error ZeroBeneficiary();
    error BeneficiaryIsThePayer();
    error BeneficiaryIsThisContract();
    error ZeroAsset();
    error AssetIsStable();
    error ZeroAmount();
    error MinOutRequired();
    error TipTooHigh();
    error CliffAfterDuration();
    error ZeroDuration();
    error DurationTooLong();
    error RouterCallFailed();
    error BelowMinimum(uint256 delivered, uint256 minOut);
    error NothingDue();
    error AlreadySealed();
    error SealedGrantCannotBeRevoked();
    error AlreadyRevoked();
    error NotFinished();
    error NoShares();
    error PoolEmpty();
    error Reentrant();
    error PermitFailed();

    uint256 private _lock = 1;

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrant();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(IERC20 stable_, address router_, address routerSpender_) {
        stable = stable_;
        router = router_;
        routerSpender = routerSpender_;
    }

    // --- opening ----------------------------------------------------------------------

    struct Terms {
        address beneficiary;
        address asset;
        /// @dev Stablecoin the payer commits. Swapped once, here, into the escrow.
        uint256 stableAmount;
        /// @dev The least the escrow must end up holding, or nothing is opened.
        uint256 minOut;
        /// @dev Zero means "now".
        uint64 start;
        uint64 cliff;
        uint64 duration;
        uint16 tipBps;
        bytes32 reasonHash;
        bytes routerCalldata;
    }

    /// @notice Open a grant and fund it. The payer must have approved this contract.
    function open(Terms calldata t) external nonReentrant returns (uint256 id) {
        return _open(t);
    }

    /// @notice Open a grant, approving with a signature rather than a prior transaction.
    function openWithPermit(Terms calldata t, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
        returns (uint256 id)
    {
        try IERC20Permit(address(stable)).permit(msg.sender, address(this), value, deadline, v, r, s) {}
        catch {
            if (stable.allowance(msg.sender, address(this)) < value) revert PermitFailed();
        }
        return _open(t);
    }

    function _open(Terms calldata t) private returns (uint256 id) {
        if (t.beneficiary == address(0)) revert ZeroBeneficiary();
        if (t.beneficiary == msg.sender) revert BeneficiaryIsThePayer();
        if (t.beneficiary == address(this)) revert BeneficiaryIsThisContract();
        if (t.asset == address(0)) revert ZeroAsset();
        if (t.asset == address(stable)) revert AssetIsStable();
        if (t.stableAmount == 0) revert ZeroAmount();
        if (t.minOut == 0) revert MinOutRequired();
        if (t.tipBps > MAX_TIP_BPS) revert TipTooHigh();
        if (t.duration == 0) revert ZeroDuration();
        if (t.duration > MAX_DURATION) revert DurationTooLong();
        if (t.cliff > t.duration) revert CliffAfterDuration();

        uint64 start = t.start == 0 ? uint64(block.timestamp) : t.start;

        // Buy the asset once, now, bounded by a floor the payer signed for.
        uint256 poolBefore = IERC20(t.asset).balanceOf(address(this));
        // What this contract held in the STABLECOIN before the payer's money arrived.
        // Only the difference is theirs to get back; a donation is not.
        uint256 stableFloor = stable.balanceOf(address(this));

        stable.safeTransferFrom(msg.sender, address(this), t.stableAmount);
        stable.safeApprove(routerSpender, t.stableAmount);
        (bool ok,) = router.call(t.routerCalldata);
        if (!ok) revert RouterCallFailed();
        stable.safeApprove(routerSpender, 0);

        uint256 delivered = IERC20(t.asset).balanceOf(address(this)) - poolBefore;
        if (delivered < t.minOut) revert BelowMinimum(delivered, t.minOut);

        // Shares against the pool as it stood BEFORE this deposit, with the virtual offset
        // above. Rounds DOWN, so a new grant never takes value from the ones already here.
        uint256 outstanding = poolShares[t.asset];
        uint256 newShares = (delivered * (outstanding + SHARE_OFFSET)) / (poolBefore + 1);
        if (newShares == 0) revert NoShares();
        poolShares[t.asset] = outstanding + newShares;

        // Whatever the route did not spend goes straight back; this contract holds no
        // stablecoin between calls, only the assets its grants are denominated in.
        uint256 leftover = stable.balanceOf(address(this));
        if (leftover > stableFloor) stable.safeTransfer(msg.sender, leftover - stableFloor);

        id = ++grantCount;
        grants[id] = Grant({
            payer: msg.sender,
            beneficiary: t.beneficiary,
            asset: t.asset,
            shares: _u128(newShares),
            sharesReleased: 0,
            stableCost: _u128(t.stableAmount),
            start: start,
            cliff: t.cliff,
            duration: t.duration,
            tipBps: t.tipBps,
            isSealed: false,
            revoked: false,
            frozenVestedShares: 0,
            reasonHash: t.reasonHash,
            state: State.Open
        });

        emit GrantOpened(
            id,
            msg.sender,
            t.beneficiary,
            t.asset,
            delivered,
            newShares,
            t.stableAmount,
            start,
            t.cliff,
            t.duration,
            t.tipBps,
            t.reasonHash
        );
    }

    // --- the schedule -----------------------------------------------------------------

    /// @notice Shares vested at `atTime`. Pure arithmetic on the grant's own terms, and
    ///         the only part of a grant that time alone decides.
    function vestedSharesAt(uint256 id, uint256 atTime) public view returns (uint256) {
        Grant storage g = grants[id];
        if (g.state == State.None) revert NoSuchGrant();
        return _vestedShares(g, atTime);
    }

    /// @notice Shares that could be released right now.
    function releasableShares(uint256 id) public view returns (uint256) {
        Grant storage g = grants[id];
        if (g.state == State.None) revert NoSuchGrant();
        return _vestedShares(g, block.timestamp) - g.sharesReleased;
    }

    /// @notice What those shares are worth in asset units at this moment.
    function releasableUnits(uint256 id) external view returns (uint256) {
        Grant storage g = grants[id];
        if (g.state == State.None) revert NoSuchGrant();
        return _toUnits(g.asset, _vestedShares(g, block.timestamp) - g.sharesReleased);
    }

    /// @notice Units still held for this grant, vested or not.
    function heldUnits(uint256 id) external view returns (uint256) {
        Grant storage g = grants[id];
        if (g.state == State.None) revert NoSuchGrant();
        return _toUnits(g.asset, uint256(g.shares) - g.sharesReleased);
    }

    /// @notice Units vested at `atTime`, priced at the pool as it stands now. A figure for
    ///         a page to show; the contract itself only ever settles in shares.
    function vestedUnitsAt(uint256 id, uint256 atTime) external view returns (uint256) {
        Grant storage g = grants[id];
        if (g.state == State.None) revert NoSuchGrant();
        return _toUnits(g.asset, _vestedShares(g, atTime));
    }

    function _vestedShares(Grant storage g, uint256 atTime) private view returns (uint256) {
        // Revocation freezes the schedule. Nothing further ever vests.
        if (g.revoked) return g.frozenVestedShares;
        if (atTime < uint256(g.start) + g.cliff) return 0;
        if (atTime >= uint256(g.start) + g.duration) return g.shares;
        // Linear from `start`, so at the cliff the whole elapsed share lands at once.
        return (uint256(g.shares) * (atTime - g.start)) / g.duration;
    }

    /**
     * @dev Rounds DOWN, always. A remainder stays in the pool rather than being paid out of
     *      another grant's holding. The +1 and the offset mirror `_open` exactly, so a
     *      deposit into an empty pool converts back to precisely what was put in.
     */
    function _toUnits(address asset, uint256 shares) private view returns (uint256) {
        if (shares == 0) return 0;
        uint256 outstanding = poolShares[asset];
        return (shares * (IERC20(asset).balanceOf(address(this)) + 1)) / (outstanding + SHARE_OFFSET);
    }

    // --- vesting ----------------------------------------------------------------------

    /**
     * @notice Release what is due. ANYONE may call this, and whoever does is paid a share
     *         of what it released — so a grant vests whether or not the payer remembers.
     *
     * @dev The beneficiary vesting for themselves pays no tip; it is their grant.
     */
    function vest(uint256 id) external nonReentrant returns (uint256 toBeneficiary, uint256 toCaller) {
        Grant storage g = grants[id];
        if (g.state != State.Open) revert NotOpen();

        uint256 dueShares = _vestedShares(g, block.timestamp) - g.sharesReleased;
        if (dueShares == 0) revert NothingDue();

        // Price the shares against the pool as it stands, THEN burn them. A vest that
        // would round to nothing is refused rather than burning a share for no units.
        uint256 due = _toUnits(g.asset, dueShares);
        if (due == 0) revert NothingDue();

        g.sharesReleased += _u128(dueShares);
        poolShares[g.asset] -= dueShares;

        // A fixed share of each release, so the tips over a grant's whole life sum to at
        // most tipBps of it however many times anyone calls.
        toCaller = msg.sender == g.beneficiary ? 0 : (due * g.tipBps) / 10_000;
        toBeneficiary = due - toCaller;

        IERC20 asset = IERC20(g.asset);
        asset.safeTransfer(g.beneficiary, toBeneficiary);
        if (toCaller != 0) asset.safeTransfer(msg.sender, toCaller);

        emit Vested(
            id, g.beneficiary, msg.sender, g.asset, toBeneficiary, toCaller, g.sharesReleased, g.shares
        );
    }

    // --- the payer's two remaining powers, and giving one up --------------------------

    /**
     * @notice Give up the right to revoke, permanently.
     * @dev The only thing that makes a grant a grant rather than a promise. There is no
     *      unseal, on purpose.
     */
    function seal(uint256 id) external {
        Grant storage g = grants[id];
        if (g.state != State.Open) revert NotOpen();
        if (msg.sender != g.payer) revert NotThePayer();
        if (g.isSealed) revert AlreadySealed();
        g.isSealed = true;
        emit GrantSealed(id, msg.sender);
    }

    /**
     * @notice Stop the schedule. What has already vested stays the beneficiary's and can
     *         still be claimed; the rest returns to the payer.
     */
    function revoke(uint256 id) external nonReentrant returns (uint256 returned) {
        Grant storage g = grants[id];
        if (g.state != State.Open) revert NotOpen();
        if (msg.sender != g.payer) revert NotThePayer();
        if (g.isSealed) revert SealedGrantCannotBeRevoked();
        if (g.revoked) revert AlreadyRevoked();

        uint256 vestedShares = _vestedShares(g, block.timestamp);
        uint256 unvestedShares = uint256(g.shares) - vestedShares;

        g.revoked = true;
        g.frozenVestedShares = _u128(vestedShares);
        g.shares = _u128(vestedShares);

        if (unvestedShares != 0) {
            returned = _toUnits(g.asset, unvestedShares);
            poolShares[g.asset] -= unvestedShares;
            if (returned != 0) IERC20(g.asset).safeTransfer(g.payer, returned);
        }

        emit GrantRevoked(id, g.payer, _toUnits(g.asset, vestedShares), returned);
    }

    /**
     * @notice Close a grant once everything owed has been released. Anyone may call it;
     *         it moves no money except dust the escrow should not be holding.
     */
    function close(uint256 id) external nonReentrant {
        Grant storage g = grants[id];
        if (g.state != State.Open) revert NotOpen();
        if (g.sharesReleased < g.shares) revert NotFinished();

        g.state = State.Closed;

        // Nothing is swept here. Every share this grant held has been burned, and the
        // rounding remainder left behind belongs to the pool the other grants share.
        emit GrantClosed(id, 0);
    }

    // --- reading ----------------------------------------------------------------------

    function grant(uint256 id) external view returns (Grant memory) {
        Grant storage g = grants[id];
        if (g.state == State.None) revert NoSuchGrant();
        return g;
    }

    function _u128(uint256 v) private pure returns (uint128) {
        // Every amount here is a token balance that already fits; this is the assertion,
        // not a silent truncation.
        require(v <= type(uint128).max, "amount too large");
        return uint128(v);
    }
}
