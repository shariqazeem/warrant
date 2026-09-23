// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "../../src/interfaces/IERC20.sol";
import {SafeToken} from "../../src/lib/SafeToken.sol";
import {Payroll} from "../../src/Payroll.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice Stands in for the OKX `TokenApprove` proxy: the router never pulls directly, it
///         claims through this, which is the address the payer's contract approves.
contract MockApproveProxy {
    using SafeToken for IERC20;

    /// @dev Safe-transfers, like the real one. A plain `transferFrom` through a typed
    ///      interface reverts on a token that returns nothing, which USDT does.
    function claimTokens(address token, address from, address to, uint256 amount) external {
        IERC20(token).safeTransferFrom(from, to, amount);
    }
}

/// @notice Stands in for the OKX DEX router. The test writes the fill it wants into the
///         calldata, so underdelivery, misrouting and partial spends are all expressible.
contract MockRouter {
    MockApproveProxy public immutable proxy;

    constructor(MockApproveProxy proxy_) {
        proxy = proxy_;
    }

    /// @param spend  how much of `tokenIn` the route actually consumes. Less than the
    ///               approval leaves dust behind, which is a case the rail must handle.
    function swap(
        address tokenIn,
        uint256 spend,
        address tokenOut,
        uint256 amountOut,
        address to
    ) external {
        proxy.claimTokens(tokenIn, msg.sender, address(this), spend);
        MockERC20(tokenOut).mint(to, amountOut);
    }
}

/// @notice A router that calls back into Payroll mid-swap.
contract ReentrantRouter {
    Payroll public payroll;

    function point(Payroll payroll_) external {
        payroll = payroll_;
    }

    function swap(address, uint256, address, uint256, address) external {
        Payroll.Line memory line = Payroll.Line({
            recipient: address(0xBEEF),
            asset: address(0),
            stableAmount: 1,
            cashAmount: 1,
            minOut: 0,
            reasonHash: bytes32(0),
            routerCalldata: ""
        });
        Payroll.Line[] memory lines = new Payroll.Line[](1);
        lines[0] = line;
        payroll.payMany(lines, bytes32("re"));
    }
}
