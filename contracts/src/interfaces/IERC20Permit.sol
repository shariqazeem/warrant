// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice EIP-2612. USDT on X Layer implements it: PERMIT_TYPEHASH reads
///         0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9, which is
///         keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)").
interface IERC20Permit {
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function nonces(address owner) external view returns (uint256);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
