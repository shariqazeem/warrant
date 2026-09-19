// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Payroll} from "../src/Payroll.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {MockERC20, MockUSDT} from "./mocks/MockERC20.sol";
import {MockRouter, MockApproveProxy, ReentrantRouter} from "./mocks/MockRouter.sol";

contract PayrollTest is Test {
    Payroll internal payroll;
    MockUSDT internal stable;
    MockERC20 internal asset;
    MockRouter internal router;
    MockApproveProxy internal proxy;

    address internal payer = makeAddr("payer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    bytes32 internal constant RUN = bytes32("run-2026-09-19");
    string internal constant REASON = "Design review, week 38";
    bytes32 internal constant REASON_HASH =
        0xc35125c0955cfae5de059f0930914793effb971856e9d81ca483713b022aaa14;

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

    function setUp() public {
        stable = new MockUSDT();
        asset = new MockERC20("Wrapped NVIDIA xStock", "wNVDAx", 18);
        proxy = new MockApproveProxy();
        router = new MockRouter(proxy);
        payroll = new Payroll(IERC20(address(stable)), address(router), address(proxy));

        stable.mint(payer, 1_000e6);
        vm.prank(payer);
        stable.approve(address(payroll), type(uint256).max);
    }

    // --- helpers -----------------------------------------------------------------------

    function _route(uint256 spend, uint256 out, address to) internal view returns (bytes memory) {
        return abi.encodeCall(MockRouter.swap, (address(stable), spend, address(asset), out, to));
    }

    function _line(address to, uint256 amount, uint256 cash, uint256 minOut, bytes memory data)
        internal
        pure
        returns (Payroll.Line memory)
    {
        return Payroll.Line({
            recipient: to,
            stableAmount: amount,
            cashAmount: cash,
            minOut: minOut,
            reasonHash: REASON_HASH,
            routerCalldata: data
        });
    }

    // --- the asset reaches the person, not the contract --------------------------------

    function test_payOne_deliversToRecipientOwnAddress() public {
        uint256 out = 0.0143e18;
        Payroll.Line memory line = _line(alice, 25e6, 0, 0.014e18, _route(25e6, out, alice));

        vm.prank(payer);
        payroll.payOne(line, address(asset), RUN);

        assertEq(asset.balanceOf(alice), out, "recipient holds the asset");
        assertEq(asset.balanceOf(address(payroll)), 0, "contract holds no asset");
        assertEq(stable.balanceOf(address(payroll)), 0, "contract holds no stablecoin");
        assertEq(stable.balanceOf(payer), 975e6, "payer debited exactly the amount paid");
    }

    /// A route that pays the contract instead of the person still has to reach the person.
    function test_payOne_routeToContractIsForwardedOn() public {
        uint256 out = 0.02e18;
        Payroll.Line memory line =
            _line(alice, 25e6, 0, 0.019e18, _route(25e6, out, address(payroll)));

        vm.prank(payer);
        payroll.payOne(line, address(asset), RUN);

        assertEq(asset.balanceOf(alice), out, "forwarded to the recipient");
        assertEq(asset.balanceOf(address(payroll)), 0, "nothing stranded");
    }

    // --- the minimum out ----------------------------------------------------------------

    function test_payOne_revertsBelowMinimum() public {
        Payroll.Line memory line = _line(alice, 25e6, 0, 0.014e18, _route(25e6, 0.0139e18, alice));

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(Payroll.BelowMinimum.selector, 0, 0.0139e18, 0.014e18)
        );
        payroll.payOne(line, address(asset), RUN);

        assertEq(asset.balanceOf(alice), 0, "nothing settled");
        assertEq(stable.balanceOf(payer), 1_000e6, "payer untouched");
    }

    function test_payOne_revertsWhenRouteDeliversNothing() public {
        Payroll.Line memory line = _line(alice, 25e6, 0, 1, _route(25e6, 0, alice));

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Payroll.BelowMinimum.selector, 0, 0, 1));
        payroll.payOne(line, address(asset), RUN);
    }

    function test_payOne_revertsWhenRouteReverts() public {
        Payroll.Line memory line = _line(alice, 25e6, 0, 1, hex"deadbeef");

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Payroll.RouterCallFailed.selector, 0));
        payroll.payOne(line, address(asset), RUN);
    }

    function test_payOne_swapWithoutFloorIsRefused() public {
        Payroll.Line memory line = _line(alice, 25e6, 0, 0, _route(25e6, 1e18, alice));

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Payroll.MinOutRequired.selector, 0));
        payroll.payOne(line, address(asset), RUN);
    }

    function test_payOne_floorWithoutSwapIsRefused() public {
        Payroll.Line memory line = _line(alice, 25e6, 25e6, 1, "");

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Payroll.MinOutWithoutSwap.selector, 0));
        payroll.payOne(line, address(asset), RUN);
    }

    // --- the split ------------------------------------------------------------------------

    function test_payOne_splitPaysCashAndOwnership() public {
        uint256 out = 0.034e18;
        Payroll.Line memory line = _line(alice, 100e6, 40e6, 0.03e18, _route(60e6, out, alice));

        vm.prank(payer);
        payroll.payOne(line, address(asset), RUN);

        assertEq(stable.balanceOf(alice), 40e6, "the cash half");
        assertEq(asset.balanceOf(alice), out, "the ownership half");
        assertEq(stable.balanceOf(payer), 900e6, "payer debited the whole line, once");
        assertEq(stable.balanceOf(address(payroll)), 0, "nothing left behind");
    }

    function test_payOne_allCashMakesNoRouterCall() public {
        Payroll.Line memory line = _line(alice, 50e6, 50e6, 0, "");

        vm.prank(payer);
        vm.expectEmit(true, true, true, true);
        emit Paid(payer, alice, RUN, address(asset), 50e6, 50e6, 0, REASON_HASH);
        payroll.payOne(line, address(asset), RUN);

        assertEq(stable.balanceOf(alice), 50e6);
        assertEq(asset.balanceOf(alice), 0);
    }

    function testFuzz_split_isExact(uint256 amount, uint256 cash, uint256 out) public {
        amount = bound(amount, 1, 1_000e6);
        cash = bound(cash, 0, amount);
        out = bound(out, 1, 1e24);

        uint256 swapAmount = amount - cash;
        bytes memory data = swapAmount == 0 ? bytes("") : _route(swapAmount, out, alice);
        Payroll.Line memory line = _line(alice, amount, cash, swapAmount == 0 ? 0 : 1, data);

        vm.prank(payer);
        payroll.payOne(line, address(asset), RUN);

        assertEq(stable.balanceOf(alice), cash, "cash equals the cash half exactly");
        assertEq(asset.balanceOf(alice), swapAmount == 0 ? 0 : out, "asset equals the fill");
        assertEq(stable.balanceOf(payer), 1_000e6 - amount, "payer debited the line, exactly");
        assertEq(stable.balanceOf(address(payroll)), 0, "contract rests at zero");
    }

    // --- a run ------------------------------------------------------------------------------

    function test_payMany_oneRunIdAcrossEveryReceipt() public {
        Payroll.Line[] memory lines = new Payroll.Line[](3);
        lines[0] = _line(alice, 25e6, 0, 1, _route(25e6, 0.01e18, alice));
        lines[1] = _line(bob, 30e6, 0, 1, _route(30e6, 0.012e18, bob));
        lines[2] = _line(carol, 45e6, 15e6, 1, _route(30e6, 0.011e18, carol));

        vm.expectEmit(true, true, true, true);
        emit Paid(payer, alice, RUN, address(asset), 25e6, 0, 0.01e18, REASON_HASH);
        vm.expectEmit(true, true, true, true);
        emit Paid(payer, bob, RUN, address(asset), 30e6, 0, 0.012e18, REASON_HASH);
        vm.expectEmit(true, true, true, true);
        emit Paid(payer, carol, RUN, address(asset), 45e6, 15e6, 0.011e18, REASON_HASH);

        vm.prank(payer);
        payroll.payMany(lines, address(asset), RUN);

        assertEq(asset.balanceOf(alice), 0.01e18);
        assertEq(asset.balanceOf(bob), 0.012e18);
        assertEq(asset.balanceOf(carol), 0.011e18);
        assertEq(stable.balanceOf(carol), 15e6);
        assertEq(stable.balanceOf(payer), 900e6, "the sum of the lines, pulled once");
        assertEq(stable.balanceOf(address(payroll)), 0);
    }

    function test_payMany_oneBadLineVoidsTheWholeRun() public {
        Payroll.Line[] memory lines = new Payroll.Line[](3);
        lines[0] = _line(alice, 25e6, 0, 1, _route(25e6, 0.01e18, alice));
        lines[1] = _line(bob, 30e6, 0, 0.5e18, _route(30e6, 0.012e18, bob)); // floor too high
        lines[2] = _line(carol, 45e6, 0, 1, _route(45e6, 0.011e18, carol));

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(Payroll.BelowMinimum.selector, 1, 0.012e18, 0.5e18)
        );
        payroll.payMany(lines, address(asset), RUN);

        assertEq(asset.balanceOf(alice), 0, "the line before it did not stand");
        assertEq(stable.balanceOf(payer), 1_000e6, "the payer kept every cent");
    }

    function test_payMany_emptyIsRefused() public {
        Payroll.Line[] memory lines = new Payroll.Line[](0);
        vm.prank(payer);
        vm.expectRevert(Payroll.NoLines.selector);
        payroll.payMany(lines, address(asset), RUN);
    }

    // --- what the route leaves behind --------------------------------------------------------

    function test_unspentStablecoinGoesBackToThePayer() public {
        // the route is approved 25 and consumes 20
        Payroll.Line memory line = _line(alice, 25e6, 0, 1, _route(20e6, 0.01e18, alice));

        vm.prank(payer);
        payroll.payOne(line, address(asset), RUN);

        assertEq(stable.balanceOf(payer), 980e6, "only what the route spent left the payer");
        assertEq(stable.balanceOf(address(payroll)), 0, "the contract kept nothing");
    }

    function test_approvalIsZeroedAfterTheSwap() public {
        Payroll.Line memory line = _line(alice, 25e6, 0, 1, _route(25e6, 0.01e18, alice));

        vm.prank(payer);
        payroll.payOne(line, address(asset), RUN);

        assertEq(stable.allowance(address(payroll), address(proxy)), 0, "no standing allowance");
    }

    // --- guards --------------------------------------------------------------------------------

    function test_rejects_zeroRecipient() public {
        Payroll.Line memory line = _line(address(0), 25e6, 25e6, 0, "");
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Payroll.ZeroRecipient.selector, 0));
        payroll.payOne(line, address(asset), RUN);
    }

    function test_rejects_recipientIsTheContract() public {
        Payroll.Line memory line = _line(address(payroll), 25e6, 25e6, 0, "");
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Payroll.RecipientIsContract.selector, 0));
        payroll.payOne(line, address(asset), RUN);
    }

    function test_rejects_zeroAmount() public {
        Payroll.Line memory line = _line(alice, 0, 0, 0, "");
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Payroll.ZeroAmount.selector, 0));
        payroll.payOne(line, address(asset), RUN);
    }

    function test_rejects_cashAboveTheLine() public {
        Payroll.Line memory line = _line(alice, 25e6, 26e6, 0, "");
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Payroll.CashExceedsTotal.selector, 0));
        payroll.payOne(line, address(asset), RUN);
    }

    function test_rejects_payingTheStablecoinAsTheAsset() public {
        Payroll.Line memory line = _line(alice, 25e6, 25e6, 0, "");
        vm.prank(payer);
        vm.expectRevert(Payroll.AssetIsStable.selector);
        payroll.payOne(line, address(stable), RUN);
    }

    function test_rejects_zeroAsset() public {
        Payroll.Line memory line = _line(alice, 25e6, 25e6, 0, "");
        vm.prank(payer);
        vm.expectRevert(Payroll.ZeroAsset.selector);
        payroll.payOne(line, address(0), RUN);
    }

    function test_reentrantRouteIsRefused() public {
        ReentrantRouter bad = new ReentrantRouter();
        Payroll p = new Payroll(IERC20(address(stable)), address(bad), address(proxy));
        bad.point(p);

        vm.prank(payer);
        stable.approve(address(p), type(uint256).max);

        Payroll.Line memory line =
            _line(alice, 25e6, 0, 1, abi.encodeCall(ReentrantRouter.swap, (address(0), 0, address(0), 0, address(0))));

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Payroll.RouterCallFailed.selector, 0));
        p.payOne(line, address(asset), RUN);
    }

    // --- what somebody else's money must not do -----------------------------------------------
    //
    // Anyone can send tokens to this contract. Nothing they send may be credited to a
    // payment, because a receipt that overstates what a route produced is the one lie
    // this whole product cannot afford.

    function test_aDonatedAssetIsNotCountedTowardsAPaymentsMinimum() public {
        // Someone leaves 1 whole unit of the asset sitting in the contract.
        asset.mint(address(payroll), 1e18);

        // A route that delivers LESS than the line's floor must still be refused, even
        // though the donation would more than cover the shortfall.
        Payroll.Line memory line = _line(alice, 25e6, 0, 0.5e18, _route(25e6, 0.01e18, alice));

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Payroll.BelowMinimum.selector, 0, 0.01e18, 0.5e18));
        payroll.payOne(line, address(asset), RUN);

        assertEq(asset.balanceOf(address(payroll)), 1e18, "the donation is still sitting there");
    }

    function test_aDonatedAssetIsNotHandedToTheNextRecipient() public {
        asset.mint(address(payroll), 1e18);

        uint256 out = 0.02e18;
        Payroll.Line memory line = _line(alice, 25e6, 0, 0.019e18, _route(25e6, out, alice));

        vm.prank(payer);
        payroll.payOne(line, address(asset), RUN);

        assertEq(asset.balanceOf(alice), out, "exactly what the route produced, and no more");
        assertEq(asset.balanceOf(address(payroll)), 1e18, "the donation was not swept to them");
    }

    function test_aDonatedStablecoinIsNotHandedToTheNextPayer() public {
        stable.mint(address(payroll), 500e6);

        Payroll.Line memory line = _line(alice, 25e6, 0, 1, _route(25e6, 0.01e18, alice));

        uint256 before = stable.balanceOf(payer);
        vm.prank(payer);
        payroll.payOne(line, address(asset), RUN);

        assertEq(stable.balanceOf(payer), before - 25e6, "the payer got back only their own dust");
        assertEq(stable.balanceOf(address(payroll)), 500e6, "the donation stayed where it was");
    }

    /// The route paying this contract rather than the recipient must still work, and must
    /// still forward only what the route itself produced.
    function test_aMisroutedFillIsForwardedButADonationIsNot() public {
        asset.mint(address(payroll), 1e18);

        uint256 out = 0.02e18;
        Payroll.Line memory line =
            _line(alice, 25e6, 0, 0.019e18, _route(25e6, out, address(payroll)));

        vm.prank(payer);
        payroll.payOne(line, address(asset), RUN);

        assertEq(asset.balanceOf(alice), out, "the fill reached them");
        assertEq(asset.balanceOf(address(payroll)), 1e18, "the donation did not");
    }

    // --- the reason hash ---------------------------------------------------------------------

    /// The front end and the indexer hash reasons in TypeScript. If either drifts from this
    /// function, a receipt stops being checkable. The constant is the shared fixture.
    function test_hashReason_matchesTheSharedVector() public view {
        assertEq(payroll.hashReason(REASON), REASON_HASH);
        assertEq(payroll.hashReason(REASON), keccak256(bytes(REASON)));
    }

    function test_hashReason_emptyReason() public view {
        assertEq(
            payroll.hashReason(""),
            0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
        );
    }
}
