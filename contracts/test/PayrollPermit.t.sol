// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Payroll} from "../src/Payroll.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {MockERC20, MockPermitUSDT} from "./mocks/MockERC20.sol";
import {MockRouter, MockApproveProxy} from "./mocks/MockRouter.sol";

/**
 * THE ONE SIGNATURE.
 *
 * The product's claim is that a company signs once and everyone is paid. With a separate
 * approval that is two transactions and two waits. USDT on X Layer implements EIP-2612, so
 * the payer signs a permit off chain for no gas and the run is a single transaction.
 *
 * The case worth testing hardest is not the happy one. A permit is a public signature that
 * ANYONE may submit, so it can be spent before the run lands — by a griefer, or by a
 * retried transaction. A naive implementation reverts on the spent nonce and takes the
 * whole run with it.
 */
contract PayrollPermitTest is Test {
    Payroll internal payroll;
    MockPermitUSDT internal stable;
    MockERC20 internal asset;
    MockRouter internal router;
    MockApproveProxy internal proxy;

    uint256 internal payerKey = 0xA11CE;
    address internal payer;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    bytes32 internal constant RUN = bytes32("run-permit");
    bytes32 internal constant REASON = keccak256("Design review, week 38");

    function setUp() public {
        payer = vm.addr(payerKey);
        stable = new MockPermitUSDT();
        asset = new MockERC20("S&P 500 xStock", "SPYx", 18);
        proxy = new MockApproveProxy();
        router = new MockRouter(proxy);
        payroll = new Payroll(IERC20(address(stable)), address(router), address(proxy));

        stable.mint(payer, 1_000e6);
    }

    function _sign(uint256 value, uint256 deadline) internal view returns (Payroll.Permit memory) {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                stable.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        stable.PERMIT_TYPEHASH(),
                        payer,
                        address(payroll),
                        value,
                        stable.nonces(payer),
                        deadline
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        return Payroll.Permit({value: value, deadline: deadline, v: v, r: r, s: s});
    }

    function _route(uint256 spend, uint256 out, address to) internal view returns (bytes memory) {
        return abi.encodeCall(MockRouter.swap, (address(stable), spend, address(asset), out, to));
    }

    function _line(address to, uint256 amount, uint256 minOut, bytes memory data)
        internal
        view
        returns (Payroll.Line memory)
    {
        return Payroll.Line({
            recipient: to,
            asset: address(asset),
            stableAmount: amount,
            cashAmount: 0,
            minOut: minOut,
            reasonHash: REASON,
            routerCalldata: data
        });
    }

    function test_aRunIsOneTransaction_withNoPriorApproval() public {
        Payroll.Line[] memory lines = new Payroll.Line[](2);
        lines[0] = _line(alice, 25e6, 1, _route(25e6, 0.03e18, alice));
        lines[1] = _line(bob, 35e6, 1, _route(35e6, 0.04e18, bob));

        assertEq(stable.allowance(payer, address(payroll)), 0, "nothing approved beforehand");

        Payroll.Permit memory p = _sign(60e6, block.timestamp + 1 hours);

        vm.prank(payer);
        payroll.payManyWithPermit(lines, RUN, p);

        assertEq(asset.balanceOf(alice), 0.03e18);
        assertEq(asset.balanceOf(bob), 0.04e18);
        assertEq(stable.balanceOf(payer), 940e6, "the sum of the lines, pulled once");
    }

    function test_payOneWithPermit() public {
        Payroll.Permit memory p = _sign(25e6, block.timestamp + 1 hours);
        Payroll.Line memory line = _line(alice, 25e6, 1, _route(25e6, 0.03e18, alice));

        vm.prank(payer);
        payroll.payOneWithPermit(line, RUN, p);

        assertEq(asset.balanceOf(alice), 0.03e18);
    }

    /// A public signature anyone may submit. Someone front-running it must not void the run.
    function test_aSpentPermitDoesNotVoidTheRun() public {
        Payroll.Permit memory p = _sign(25e6, block.timestamp + 1 hours);

        // A stranger submits the payer's permit first. The allowance it creates still stands.
        vm.prank(makeAddr("griefer"));
        stable.permit(payer, address(payroll), p.value, p.deadline, p.v, p.r, p.s);
        assertEq(stable.allowance(payer, address(payroll)), 25e6, "the allowance exists");

        Payroll.Line memory line = _line(alice, 25e6, 1, _route(25e6, 0.03e18, alice));

        // The nonce is spent, so the permit inside the run reverts. The run must not.
        vm.prank(payer);
        payroll.payOneWithPermit(line, RUN, p);

        assertEq(asset.balanceOf(alice), 0.03e18, "paid anyway");
    }

    /// But a permit that fails AND leaves no allowance is fatal, and says which.
    function test_aFailedPermitWithNoAllowanceIsRefused() public {
        Payroll.Permit memory bad = _sign(25e6, block.timestamp + 1 hours);
        bad.r = bytes32(uint256(bad.r) ^ 1); // corrupt the signature

        Payroll.Line memory line = _line(alice, 25e6, 1, _route(25e6, 0.03e18, alice));

        vm.prank(payer);
        vm.expectRevert(Payroll.PermitFailed.selector);
        payroll.payOneWithPermit(line, RUN, bad);
    }

    function test_anExpiredPermitIsRefused() public {
        vm.warp(1_000_000);
        Payroll.Permit memory p = _sign(25e6, block.timestamp - 1);

        Payroll.Line memory line = _line(alice, 25e6, 1, _route(25e6, 0.03e18, alice));

        vm.prank(payer);
        vm.expectRevert(Payroll.PermitFailed.selector);
        payroll.payOneWithPermit(line, RUN, p);
    }

    /// A permit for less than the run cannot quietly pay a smaller run.
    function test_aPermitTooSmallForTheRunIsRefused() public {
        Payroll.Line[] memory lines = new Payroll.Line[](2);
        lines[0] = _line(alice, 25e6, 1, _route(25e6, 0.03e18, alice));
        lines[1] = _line(bob, 35e6, 1, _route(35e6, 0.04e18, bob));

        Payroll.Permit memory p = _sign(30e6, block.timestamp + 1 hours); // 60 needed

        vm.prank(payer);
        vm.expectRevert(); // the transferFrom for the full total has nothing to draw on
        payroll.payManyWithPermit(lines, RUN, p);

        assertEq(asset.balanceOf(alice), 0, "nothing settled");
        assertEq(stable.balanceOf(payer), 1_000e6, "the payer kept every cent");
    }

    /// Another payer's signature cannot be used to spend this payer's money.
    function test_aPermitSignedByYouCannotBeSpentByMe() public {
        Payroll.Permit memory p = _sign(25e6, block.timestamp + 1 hours);
        Payroll.Line memory line = _line(alice, 25e6, 1, _route(25e6, 0.03e18, alice));

        address stranger = makeAddr("stranger");
        stable.mint(stranger, 100e6);

        // The permit names the payer as owner, so submitted by anyone else it approves
        // the payer's balance, not the stranger's — and the run then draws on the
        // stranger, who approved nothing.
        vm.prank(stranger);
        vm.expectRevert();
        payroll.payOneWithPermit(line, RUN, p);
    }
}
