// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";

/// @notice ERC20 calls that tolerate tokens returning nothing at all.
///         USDT is the reason this library exists.
library SafeToken {
    error TransferFailed();
    error TransferFromFailed();
    error ApproveFailed();

    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        if (!_call(token, abi.encodeCall(IERC20.transfer, (to, value)))) revert TransferFailed();
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        if (!_call(token, abi.encodeCall(IERC20.transferFrom, (from, to, value)))) {
            revert TransferFromFailed();
        }
    }

    /// @dev Every approval this contract makes is zeroed in the same transaction, so a token
    ///      that refuses a nonzero-to-nonzero approval is never asked to make one.
    function safeApprove(IERC20 token, address spender, uint256 value) internal {
        if (!_call(token, abi.encodeCall(IERC20.approve, (spender, value)))) revert ApproveFailed();
    }

    function _call(IERC20 token, bytes memory data) private returns (bool) {
        (bool ok, bytes memory ret) = address(token).call(data);
        if (!ok) return false;
        if (ret.length == 0) return address(token).code.length > 0;
        return abi.decode(ret, (bool));
    }
}
