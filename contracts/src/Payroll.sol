// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IERC20Permit} from "./interfaces/IERC20Permit.sol";
import {SafeToken} from "./lib/SafeToken.sol";

/// @title Payroll
/// @notice Warrant's rail. A company pays its people in dollars, and EACH PERSON'S OWN CHOICE
///         decides how much of it becomes stock, and which stock: the stablecoin is pulled
///         from the payer once, the stock part of each line is routed through the OKX DEX
///         aggregator into that line's asset, and it lands in the recipient's own wallet;
///         the rest arrives as the stablecoin. One run can carry a different stock on every
///         line, so twenty people's twenty choices are still one signature. Every payment
///         emits one `Paid` event, and that event is the record.
///
/// @dev Threat model for `routerCalldata`, which is opaque bytes built off chain:
///      - the only address this contract will ever call is the immutable `router`;
///      - the only allowance it ever grants is to the immutable `routerSpender`, for exactly
///        the amount being swapped on this line, and it is zeroed in the same call;
///      - the recipient's own balance is measured before and after, and the line reverts
///        below `minOut`. A route that does not deliver cannot be settled.
///      This contract is not a vault. It holds nothing between transactions: whatever the
///      route leaves behind goes to the recipient, and leftover stablecoin goes to the payer.
contract Payroll {
    using SafeToken for IERC20;

    /// @param recipient      the person being paid; the asset lands in this wallet
    /// @param asset          the stock this person's share becomes, or address(0) when none of
    ///                       the line is swapped (a person who chose to be paid all in dollars)
    /// @param stableAmount   total stablecoin pulled from the payer for this line
    /// @param cashAmount     the part of it delivered as the stablecoin, unswapped. The split.
    /// @param minOut         the least asset the recipient must end up holding, or the line reverts
    /// @param reasonHash     keccak256 of the reason text; the text itself lives in the indexer
    /// @param routerCalldata the swap, built by the OKX aggregator server side
    struct Line {
        address recipient;
        address asset;
        uint256 stableAmount;
        uint256 cashAmount;
        uint256 minOut;
        bytes32 reasonHash;
        bytes routerCalldata;
    }

    /// @notice An EIP-2612 signature standing in for a separate approval transaction.
    ///         USDT on X Layer implements permit, so a payer signs once, off chain and for
    ///         no gas, and the run is one transaction rather than two.
    struct Permit {
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    IERC20 public immutable stable;
    address public immutable router;
    address public immutable routerSpender;

    event Paid(
        address indexed payer,
        address indexed recipient,
        bytes32 indexed runId,
        address asset,
        uint256 stableAmount,
        uint256 cashAmount,
        uint256 assetAmount,
        bytes32 reasonHash
    );

    error NoLines();
    error ZeroRecipient(uint256 index);
    error RecipientIsContract(uint256 index);
    error ZeroAmount(uint256 index);
    error CashExceedsTotal(uint256 index);
    error MinOutRequired(uint256 index);
    error MinOutWithoutSwap(uint256 index);
    error AssetIsStable(uint256 index);
    error ZeroAsset(uint256 index);
    error AssetWithoutSwap(uint256 index);
    error RouterCallFailed(uint256 index);
    error BelowMinimum(uint256 index, uint256 delivered, uint256 minOut);
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

    /// @notice Pay one person. The payer must have approved this contract for `stableAmount`.
    function payOne(Line calldata line, bytes32 runId) external nonReentrant {
        _payOne(line, runId);
    }

    /// @notice Pay a run. One `runId`, N receipts, each line in its own person's chosen
    ///         stock. The payer must have approved this contract for the sum of the lines.
    function payMany(Line[] calldata lines, bytes32 runId) external nonReentrant {
        _payMany(lines, runId);
    }

    /// @notice Pay one person, approving with a signature instead of a prior transaction.
    function payOneWithPermit(Line calldata line, bytes32 runId, Permit calldata p) external nonReentrant {
        _usePermit(p);
        _payOne(line, runId);
    }

    /// @notice THE ONE SIGNATURE. A payer signs an EIP-2612 permit off chain, for no gas,
    ///         and this single transaction approves and pays the whole run.
    function payManyWithPermit(Line[] calldata lines, bytes32 runId, Permit calldata p) external nonReentrant {
        _usePermit(p);
        _payMany(lines, runId);
    }

    /**
     * @dev A permit is a public signature and anyone may submit it. If someone already
     *      has — to grief the payer, or simply because a transaction was retried — the
     *      permit call reverts on a spent nonce and would take the whole run with it.
     *      So a failed permit is only fatal when the allowance it was meant to create is
     *      not there anyway. The transferFrom below is what actually enforces it.
     */
    function _usePermit(Permit calldata p) private {
        try IERC20Permit(address(stable)).permit(
            msg.sender, address(this), p.value, p.deadline, p.v, p.r, p.s
        ) {
            return;
        } catch {
            if (stable.allowance(msg.sender, address(this)) < p.value) revert PermitFailed();
        }
    }

    function _payOne(Line calldata line, bytes32 runId) private {
        uint256 total = _check(line, 0);
        uint256 floor = stable.balanceOf(address(this));
        stable.safeTransferFrom(msg.sender, address(this), total);
        _settle(line, runId, 0);
        _returnDust(floor);
    }

    function _payMany(Line[] calldata lines, bytes32 runId) private {
        uint256 n = lines.length;
        if (n == 0) revert NoLines();

        uint256 total;
        for (uint256 i; i < n; ++i) {
            total += _check(lines[i], i);
        }

        uint256 floor = stable.balanceOf(address(this));
        stable.safeTransferFrom(msg.sender, address(this), total);

        for (uint256 i; i < n; ++i) {
            _settle(lines[i], runId, i);
        }

        _returnDust(floor);
    }

    /// @notice The reason hash, computed the same way on chain as off. The front end and the
    ///         indexer must agree with this function or a receipt cannot be checked.
    function hashReason(string calldata reason) external pure returns (bytes32) {
        return keccak256(bytes(reason));
    }

    function _check(Line calldata line, uint256 i) private view returns (uint256) {
        if (line.recipient == address(0)) revert ZeroRecipient(i);
        if (line.recipient == address(this)) revert RecipientIsContract(i);
        if (line.stableAmount == 0) revert ZeroAmount(i);
        if (line.cashAmount > line.stableAmount) revert CashExceedsTotal(i);

        uint256 swapAmount = line.stableAmount - line.cashAmount;
        if (swapAmount != 0) {
            // A line that buys stock must name it, and it cannot be the dollar it is paid in.
            if (line.asset == address(0)) revert ZeroAsset(i);
            if (line.asset == address(stable)) revert AssetIsStable(i);
            // It must state a floor, or an empty delivery would settle silently.
            if (line.minOut == 0) revert MinOutRequired(i);
        } else {
            // A line that buys nothing promises no asset and names none, so its receipt can
            // never show a stock that was not bought.
            if (line.minOut != 0) revert MinOutWithoutSwap(i);
            if (line.asset != address(0)) revert AssetWithoutSwap(i);
        }

        return line.stableAmount;
    }

    function _settle(Line calldata line, bytes32 runId, uint256 i) private {
        uint256 swapAmount = line.stableAmount - line.cashAmount;
        address asset = line.asset;
        uint256 delivered;

        if (swapAmount != 0) {
            uint256 held = IERC20(asset).balanceOf(line.recipient);
            // What this contract held BEFORE the route ran. Anything already here was not
            // produced by this payment and must not be counted as though it were.
            uint256 ours = IERC20(asset).balanceOf(address(this));

            stable.safeApprove(routerSpender, swapAmount);
            (bool ok,) = router.call(line.routerCalldata);
            if (!ok) revert RouterCallFailed(i);
            stable.safeApprove(routerSpender, 0);

            // A route may pay the recipient directly or pay this contract. Either way the
            // asset was meant for the recipient, so forward what THIS route left here —
            // and only that. Sweeping the whole balance would let anyone donate the asset
            // to this contract and have it counted toward the next payment's minimum,
            // which would put a figure on a receipt that the route did not produce.
            uint256 after_ = IERC20(asset).balanceOf(address(this));
            uint256 stranded = after_ > ours ? after_ - ours : 0;
            if (stranded != 0) IERC20(asset).safeTransfer(line.recipient, stranded);

            delivered = IERC20(asset).balanceOf(line.recipient) - held;
            if (delivered < line.minOut) revert BelowMinimum(i, delivered, line.minOut);
        }

        if (line.cashAmount != 0) stable.safeTransfer(line.recipient, line.cashAmount);

        emit Paid(
            msg.sender,
            line.recipient,
            runId,
            asset,
            line.stableAmount,
            line.cashAmount,
            delivered,
            line.reasonHash
        );
    }

    /**
     * @dev Whatever stablecoin the route did not spend goes back to the payer, and NOTHING
     *      ELSE. `floor` is what this contract held before the payer's money arrived, so a
     *      balance somebody donated is not handed to whoever happens to pay next.
     *      This contract is never a resting place for money, and never a source of it.
     */
    function _returnDust(uint256 floor) private {
        uint256 left = stable.balanceOf(address(this));
        if (left > floor) stable.safeTransfer(msg.sender, left - floor);
    }
}
