// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {SafeToken} from "./lib/SafeToken.sol";

/// @title Payroll
/// @notice Warrant's rail. A company pays its people in ownership: the stablecoin is pulled
///         from the payer, routed through the OKX DEX aggregator, and the asset lands in the
///         recipient's own wallet. Every payment emits one `Paid` event, and that event is
///         the record — the indexer reads it, the receipt page reads the indexer.
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
    /// @param stableAmount   total stablecoin pulled from the payer for this line
    /// @param cashAmount     the part of it delivered as the stablecoin, unswapped. The split.
    /// @param minOut         the least asset the recipient must end up holding, or the line reverts
    /// @param reasonHash     keccak256 of the reason text; the text itself lives in the indexer
    /// @param routerCalldata the swap, built by the OKX aggregator server side
    struct Line {
        address recipient;
        uint256 stableAmount;
        uint256 cashAmount;
        uint256 minOut;
        bytes32 reasonHash;
        bytes routerCalldata;
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
    error AssetIsStable();
    error ZeroAsset();
    error RouterCallFailed(uint256 index);
    error BelowMinimum(uint256 index, uint256 delivered, uint256 minOut);
    error Reentrant();

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
    function payOne(Line calldata line, address asset, bytes32 runId) external nonReentrant {
        _checkAsset(asset);
        uint256 total = _check(line, 0);
        stable.safeTransferFrom(msg.sender, address(this), total);
        _settle(line, asset, runId, 0);
        _returnDust();
    }

    /// @notice Pay a run. One signature, one `runId`, N receipts. The payer must have approved
    ///         this contract for the sum of the lines.
    function payMany(Line[] calldata lines, address asset, bytes32 runId) external nonReentrant {
        _checkAsset(asset);
        uint256 n = lines.length;
        if (n == 0) revert NoLines();

        uint256 total;
        for (uint256 i; i < n; ++i) {
            total += _check(lines[i], i);
        }

        stable.safeTransferFrom(msg.sender, address(this), total);

        for (uint256 i; i < n; ++i) {
            _settle(lines[i], asset, runId, i);
        }

        _returnDust();
    }

    /// @notice The reason hash, computed the same way on chain as off. The front end and the
    ///         indexer must agree with this function or a receipt cannot be checked.
    function hashReason(string calldata reason) external pure returns (bytes32) {
        return keccak256(bytes(reason));
    }

    function _checkAsset(address asset) private view {
        if (asset == address(0)) revert ZeroAsset();
        if (asset == address(stable)) revert AssetIsStable();
    }

    function _check(Line calldata line, uint256 i) private view returns (uint256) {
        if (line.recipient == address(0)) revert ZeroRecipient(i);
        if (line.recipient == address(this)) revert RecipientIsContract(i);
        if (line.stableAmount == 0) revert ZeroAmount(i);
        if (line.cashAmount > line.stableAmount) revert CashExceedsTotal(i);

        uint256 swapAmount = line.stableAmount - line.cashAmount;
        // A line that swaps must state a floor, or an empty delivery would settle silently.
        if (swapAmount != 0 && line.minOut == 0) revert MinOutRequired(i);
        // A line that swaps nothing cannot promise any asset.
        if (swapAmount == 0 && line.minOut != 0) revert MinOutWithoutSwap(i);

        return line.stableAmount;
    }

    function _settle(Line calldata line, address asset, bytes32 runId, uint256 i) private {
        uint256 swapAmount = line.stableAmount - line.cashAmount;
        uint256 delivered;

        if (swapAmount != 0) {
            uint256 held = IERC20(asset).balanceOf(line.recipient);

            stable.safeApprove(routerSpender, swapAmount);
            (bool ok,) = router.call(line.routerCalldata);
            if (!ok) revert RouterCallFailed(i);
            stable.safeApprove(routerSpender, 0);

            // A route may pay the recipient directly or pay this contract. Either way the
            // asset was meant for the recipient, so forward anything left here.
            uint256 stranded = IERC20(asset).balanceOf(address(this));
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

    /// @dev Whatever stablecoin the route did not spend goes back to the payer. This contract
    ///      is never a resting place for money.
    function _returnDust() private {
        uint256 left = stable.balanceOf(address(this));
        if (left != 0) stable.safeTransfer(msg.sender, left);
    }
}
