// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {GrantEscrow} from "../src/GrantEscrow.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {MockERC20, MockUSDT} from "./mocks/MockERC20.sol";
import {MockRouter, MockApproveProxy} from "./mocks/MockRouter.sol";

/**
 * THE VESTING SCHEDULE IS MONEY-CRITICAL, and it is the kind of arithmetic that is wrong
 * quietly: off by a cliff, off by a day, off by a rounding direction, and nobody finds out
 * until someone is short. So the schedule is tested at every boundary and then fuzzed for
 * the two properties that must hold for ANY time: it never goes backwards, and it never
 * exceeds the grant.
 *
 * The other thing tested hard is the keeper's tip, because `vest` is permissionless and a
 * tip is an incentive to call it. The property that makes that safe is that the tips paid
 * over a grant's whole life are bounded by `tipBps` of it however many times it is called.
 */
contract GrantEscrowTest is Test {
    GrantEscrow internal escrow;
    MockUSDT internal stable;
    MockERC20 internal asset;
    MockRouter internal router;
    MockApproveProxy internal proxy;

    address internal payer = makeAddr("payer");
    address internal alice = makeAddr("alice");
    address internal keeper = makeAddr("keeper");

    uint64 internal constant YEAR = 365 days;
    uint64 internal constant CLIFF = 90 days;
    bytes32 internal constant REASON = keccak256("Four year grant, one year cliff");

    /// The grant's size in asset units, delivered by the mock route at open.
    uint256 internal constant UNITS = 1_000e18;
    uint256 internal constant COST = 10_000e6;

    function setUp() public {
        stable = new MockUSDT();
        asset = new MockERC20("S&P 500 xStock", "SPYx", 18);
        proxy = new MockApproveProxy();
        router = new MockRouter(proxy);
        escrow = new GrantEscrow(IERC20(address(stable)), address(router), address(proxy));

        stable.mint(payer, 1_000_000e6);
        vm.prank(payer);
        stable.approve(address(escrow), type(uint256).max);

        vm.warp(1_700_000_000);
    }

    function _terms(uint64 cliff, uint64 duration, uint16 tipBps)
        internal
        view
        returns (GrantEscrow.Terms memory)
    {
        return GrantEscrow.Terms({
            beneficiary: alice,
            asset: address(asset),
            stableAmount: COST,
            minOut: 1,
            start: 0,
            cliff: cliff,
            duration: duration,
            tipBps: tipBps,
            reasonHash: REASON,
            routerCalldata: abi.encodeCall(
                MockRouter.swap, (address(stable), COST, address(asset), UNITS, address(escrow))
            )
        });
    }

    function _open() internal returns (uint256 id) {
        vm.prank(payer);
        return escrow.open(_terms(CLIFF, 4 * YEAR, 50));
    }

    // --- opening ---------------------------------------------------------------------

    function test_open_buysTheAssetOnceAndHoldsIt() public {
        uint256 id = _open();
        GrantEscrow.Grant memory g = escrow.grant(id);

        assertEq(escrow.heldUnits(id), UNITS, "the grant holds the units it bought");
        assertEq(g.shares, UNITS, "the first grant in an asset defines the share unit");
        assertEq(g.stableCost, COST, "what the payer spent, kept for the cost basis");
        assertEq(asset.balanceOf(address(escrow)), UNITS, "the escrow holds the asset");
        assertEq(stable.balanceOf(address(escrow)), 0, "and no stablecoin at all");
        assertEq(g.beneficiary, alice);
        assertEq(g.payer, payer);
        assertFalse(g.isSealed);
    }

    function test_open_revertsBelowTheFloorThePayerSignedFor() public {
        GrantEscrow.Terms memory t = _terms(CLIFF, 4 * YEAR, 50);
        t.minOut = UNITS + 1;

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(GrantEscrow.BelowMinimum.selector, UNITS, UNITS + 1));
        escrow.open(t);
    }

    function test_open_returnsWhatTheRouteDidNotSpend() public {
        GrantEscrow.Terms memory t = _terms(CLIFF, 4 * YEAR, 50);
        t.routerCalldata =
            abi.encodeCall(MockRouter.swap, (address(stable), COST - 500e6, address(asset), UNITS, address(escrow)));

        uint256 before = stable.balanceOf(payer);
        vm.prank(payer);
        escrow.open(t);

        assertEq(stable.balanceOf(payer), before - (COST - 500e6), "only what the route spent");
        assertEq(stable.balanceOf(address(escrow)), 0);
    }

    function test_open_refusesTermsThatAreNotTerms() public {
        vm.startPrank(payer);

        GrantEscrow.Terms memory t = _terms(CLIFF, 4 * YEAR, 50);
        t.beneficiary = address(0);
        vm.expectRevert(GrantEscrow.ZeroBeneficiary.selector);
        escrow.open(t);

        t = _terms(CLIFF, 4 * YEAR, 50);
        t.beneficiary = payer;
        vm.expectRevert(GrantEscrow.BeneficiaryIsThePayer.selector);
        escrow.open(t);

        t = _terms(CLIFF, 4 * YEAR, 50);
        t.asset = address(stable);
        vm.expectRevert(GrantEscrow.AssetIsStable.selector);
        escrow.open(t);

        t = _terms(CLIFF, 4 * YEAR, 50);
        t.minOut = 0;
        vm.expectRevert(GrantEscrow.MinOutRequired.selector);
        escrow.open(t);

        t = _terms(CLIFF, 4 * YEAR, 201);
        vm.expectRevert(GrantEscrow.TipTooHigh.selector);
        escrow.open(t);

        t = _terms(CLIFF, 0, 50);
        vm.expectRevert(GrantEscrow.ZeroDuration.selector);
        escrow.open(t);

        t = _terms(5 * YEAR, 4 * YEAR, 50);
        vm.expectRevert(GrantEscrow.CliffAfterDuration.selector);
        escrow.open(t);

        t = _terms(CLIFF, 3651 days, 50);
        vm.expectRevert(GrantEscrow.DurationTooLong.selector);
        escrow.open(t);

        vm.stopPrank();
    }

    // --- the schedule ----------------------------------------------------------------

    function test_schedule_nothingVestsBeforeTheCliff() public {
        uint256 id = _open();
        uint64 start = escrow.grant(id).start;

        assertEq(escrow.vestedUnitsAt(id, start), 0);
        assertEq(escrow.vestedUnitsAt(id, start + CLIFF - 1), 0, "not one unit early");
    }

    function test_schedule_theWholeElapsedShareLandsAtTheCliff() public {
        uint256 id = _open();
        uint64 start = escrow.grant(id).start;

        uint256 atCliff = escrow.vestedUnitsAt(id, start + CLIFF);
        assertEq(atCliff, (UNITS * CLIFF) / (4 * YEAR), "a cliff pays the elapsed share at once");
        assertGt(atCliff, 0);
    }

    function test_schedule_isLinearAfterTheCliffAndCompleteAtTheEnd() public {
        uint256 id = _open();
        uint64 start = escrow.grant(id).start;

        assertEq(escrow.vestedUnitsAt(id, start + 2 * YEAR), UNITS / 2, "half way, half the grant");
        assertEq(escrow.vestedUnitsAt(id, start + 4 * YEAR), UNITS, "fully vested at the end");
        assertEq(escrow.vestedUnitsAt(id, start + 40 * YEAR), UNITS, "and never more than the grant");
    }

    function testFuzz_schedule_neverGoesBackwardsAndNeverExceedsTheGrant(uint64 a, uint64 b) public {
        uint256 id = _open();
        uint64 start = escrow.grant(id).start;

        a = uint64(bound(a, 0, 20 * YEAR));
        b = uint64(bound(b, a, 20 * YEAR));

        uint256 earlier = escrow.vestedUnitsAt(id, uint256(start) + a);
        uint256 later = escrow.vestedUnitsAt(id, uint256(start) + b);

        assertLe(earlier, later, "vesting never goes backwards");
        assertLe(later, UNITS, "and never exceeds the grant");
    }

    // --- vesting ---------------------------------------------------------------------

    function test_vest_paysTheBeneficiaryAndTipsWhoeverCalled() public {
        uint256 id = _open();
        vm.warp(block.timestamp + 2 * YEAR);

        uint256 due = escrow.releasableUnits(id);
        assertEq(due, UNITS / 2);

        vm.prank(keeper);
        (uint256 toAlice, uint256 toKeeper) = escrow.vest(id);

        assertEq(toKeeper, (due * 50) / 10_000, "the keeper's 0.5%");
        assertEq(toAlice, due - toKeeper);
        assertEq(asset.balanceOf(alice), toAlice, "into the beneficiary's own wallet");
        assertEq(asset.balanceOf(keeper), toKeeper);
        assertEq(asset.balanceOf(address(escrow)), UNITS - due);
    }

    function test_vest_theBeneficiaryPaysNoTipToThemselves() public {
        uint256 id = _open();
        vm.warp(block.timestamp + 2 * YEAR);

        vm.prank(alice);
        (uint256 toAlice, uint256 toCaller) = escrow.vest(id);

        assertEq(toCaller, 0, "it is their grant");
        assertEq(toAlice, UNITS / 2);
    }

    function test_vest_withNothingDueRevertsAndPaysNobody() public {
        uint256 id = _open();

        vm.prank(keeper);
        vm.expectRevert(GrantEscrow.NothingDue.selector);
        escrow.vest(id);

        vm.warp(block.timestamp + 2 * YEAR);
        vm.prank(keeper);
        escrow.vest(id);

        vm.prank(keeper);
        vm.expectRevert(GrantEscrow.NothingDue.selector);
        escrow.vest(id);
    }

    /// The property that makes a permissionless tip safe.
    function test_vest_tipsAreBoundedHoweverOftenItIsCalled() public {
        uint256 id = _open();
        uint64 start = escrow.grant(id).start;

        // Call it every day for the whole four years: 1,460 vests instead of 4.
        for (uint256 day = 90; day <= 4 * 365; day++) {
            vm.warp(uint256(start) + day * 1 days);
            vm.prank(keeper);
            try escrow.vest(id) {} catch {}
        }

        vm.warp(uint256(start) + 4 * YEAR + 1);
        vm.prank(keeper);
        try escrow.vest(id) {} catch {}

        uint256 tips = asset.balanceOf(keeper);
        assertLe(tips, (UNITS * 50) / 10_000, "total tips are capped at tipBps of the grant");
        assertEq(asset.balanceOf(alice) + tips, UNITS, "and everything else reached the beneficiary");
        assertEq(asset.balanceOf(address(escrow)), 0, "the escrow is empty");
    }

    function test_vest_neverReleasesMoreThanTheGrant() public {
        uint256 id = _open();
        vm.warp(block.timestamp + 10 * YEAR);

        vm.prank(keeper);
        escrow.vest(id);

        GrantEscrow.Grant memory g = escrow.grant(id);
        assertEq(g.sharesReleased, g.shares, "every share burned");
        assertEq(asset.balanceOf(address(escrow)), 0);
    }

    // --- sealing ----------------------------------------------------------------------

    function test_seal_givesUpRevocationPermanently() public {
        uint256 id = _open();

        vm.prank(payer);
        escrow.seal(id);
        assertTrue(escrow.grant(id).isSealed);

        vm.prank(payer);
        vm.expectRevert(GrantEscrow.SealedGrantCannotBeRevoked.selector);
        escrow.revoke(id);

        // There is no unseal, on purpose.
        vm.prank(payer);
        vm.expectRevert(GrantEscrow.AlreadySealed.selector);
        escrow.seal(id);
    }

    function test_onlyThePayerMaySealOrRevoke() public {
        uint256 id = _open();

        vm.prank(alice);
        vm.expectRevert(GrantEscrow.NotThePayer.selector);
        escrow.seal(id);

        vm.prank(keeper);
        vm.expectRevert(GrantEscrow.NotThePayer.selector);
        escrow.revoke(id);
    }

    // --- revoking ---------------------------------------------------------------------

    function test_revoke_freezesVestingAndReturnsOnlyTheUnvested() public {
        uint256 id = _open();
        vm.warp(block.timestamp + YEAR);

        uint256 vested = escrow.releasableUnits(id);
        assertEq(vested, UNITS / 4);

        vm.prank(payer);
        uint256 returned = escrow.revoke(id);

        assertEq(returned, UNITS - vested, "the unvested part, and no more");
        assertEq(asset.balanceOf(payer), returned);

        // What already vested is still the beneficiary's, and can still be claimed.
        vm.warp(block.timestamp + 10 * YEAR);
        assertEq(escrow.releasableUnits(id), vested, "nothing further ever vests");

        vm.prank(alice);
        escrow.vest(id);
        assertEq(asset.balanceOf(alice), vested);
        assertEq(asset.balanceOf(address(escrow)), 0);
    }

    function test_revoke_afterFullVestingReturnsNothing() public {
        uint256 id = _open();
        vm.warp(block.timestamp + 5 * YEAR);

        vm.prank(payer);
        uint256 returned = escrow.revoke(id);

        assertEq(returned, 0);
        assertEq(escrow.releasableUnits(id), UNITS, "all of it is still owed to the beneficiary");
    }

    function test_revoke_afterAPartialVestAccountsForWhatWasAlreadyPaid() public {
        uint256 id = _open();
        vm.warp(block.timestamp + YEAR);

        vm.prank(alice);
        escrow.vest(id); // takes a quarter

        vm.warp(block.timestamp + YEAR);
        vm.prank(payer);
        uint256 returned = escrow.revoke(id);

        // Two years in: half vested, a quarter already paid, a quarter still owed.
        assertEq(returned, UNITS / 2, "the half that never vested");
        assertEq(escrow.releasableUnits(id), UNITS / 4, "the quarter that vested and was not taken");

        vm.prank(alice);
        escrow.vest(id);
        assertEq(asset.balanceOf(alice), UNITS / 2);
        assertEq(asset.balanceOf(address(escrow)), 0, "nothing stranded");
    }

    function test_revoke_twiceIsRefused() public {
        uint256 id = _open();
        vm.warp(block.timestamp + YEAR);

        vm.startPrank(payer);
        escrow.revoke(id);
        vm.expectRevert(GrantEscrow.AlreadyRevoked.selector);
        escrow.revoke(id);
        vm.stopPrank();
    }

    // --- closing ----------------------------------------------------------------------

    function test_close_onlyOnceEverythingOwedIsReleased() public {
        uint256 id = _open();
        vm.warp(block.timestamp + YEAR);

        vm.expectRevert(GrantEscrow.NotFinished.selector);
        escrow.close(id);

        vm.warp(block.timestamp + 4 * YEAR);
        vm.prank(alice);
        escrow.vest(id);

        escrow.close(id);
        assertEq(uint8(escrow.grant(id).state), uint8(GrantEscrow.State.Closed));

        vm.prank(alice);
        vm.expectRevert(GrantEscrow.NotOpen.selector);
        escrow.vest(id);
    }

    // --- the escrow is the contract's -------------------------------------------------

    function test_thePayerCannotReachIntoTheEscrow() public {
        uint256 id = _open();
        vm.warp(block.timestamp + YEAR);

        // There is no function that lets the payer take the asset. The only path out is
        // revoke, which returns only what never vested, and vest, which pays the
        // beneficiary. This asserts the balance is untouched by anything else.
        uint256 beforeBal = asset.balanceOf(address(escrow));
        vm.prank(payer);
        vm.expectRevert();
        escrow.vest(0); // a grant that does not exist

        assertEq(asset.balanceOf(address(escrow)), beforeBal);
        assertEq(asset.balanceOf(payer), 0, "the payer holds none of it");
        assertEq(escrow.grant(id).payer, payer);
    }

    function test_twoGrantsDoNotTouchEachOthersMoney() public {
        uint256 first = _open();
        uint256 second = _open();
        assertEq(second, first + 1);

        vm.warp(block.timestamp + 5 * YEAR);

        vm.prank(alice);
        escrow.vest(first);
        assertEq(asset.balanceOf(alice), UNITS, "only the first grant's units");
        assertEq(asset.balanceOf(address(escrow)), UNITS, "the second is untouched");

        vm.prank(alice);
        escrow.vest(second);
        assertEq(asset.balanceOf(alice), 2 * UNITS);
        assertEq(asset.balanceOf(address(escrow)), 0);
    }

    // --- the issuer changing what the escrow holds ------------------------------------
    //
    // Every xStock on X Layer sits behind one upgradeable proxy with one owner, and the
    // implementation carries mint(address,uint256) and burn(address,uint256). The escrow's
    // holdings can therefore move without a transfer ever touching it, and a grant lasts
    // years. These are the tests the share accounting exists for.

    function test_aBurnAgainstTheEscrowIsSharedByEveryGrant() public {
        uint256 first = _open();
        uint256 second = _open();
        assertEq(asset.balanceOf(address(escrow)), 2 * UNITS);

        // The issuer destroys a tenth of what this contract holds.
        asset.burnFrom(address(escrow), (2 * UNITS) / 10);

        assertEq(escrow.heldUnits(first), (UNITS * 9) / 10, "the loss is shared, not dumped on one");
        assertEq(escrow.heldUnits(second), (UNITS * 9) / 10);

        vm.warp(block.timestamp + 5 * YEAR);
        vm.prank(alice);
        escrow.vest(first);
        vm.prank(alice);
        escrow.vest(second);

        assertApproxEqAbs(asset.balanceOf(alice), (2 * UNITS * 9) / 10, 2, "and all of it still pays out");
        assertLe(asset.balanceOf(address(escrow)), 2, "nothing meaningful stranded");
    }

    function test_aMintToTheEscrowReachesTheBeneficiaries() public {
        uint256 first = _open();
        uint256 second = _open();

        // A corporate action doubling the position, as a split would.
        asset.mint(address(escrow), 2 * UNITS);

        assertEq(escrow.heldUnits(first), 2 * UNITS, "each grant's share is worth twice as much");
        assertEq(escrow.heldUnits(second), 2 * UNITS);

        vm.warp(block.timestamp + 5 * YEAR);
        vm.prank(alice);
        escrow.vest(first);
        assertEq(asset.balanceOf(alice), 2 * UNITS, "the beneficiary gets it, not the contract");
    }

    function test_aGrantOpenedAfterAMoveBuysInAtThePoolsRatio() public {
        uint256 first = _open();

        // The pool halves before the second grant is opened.
        asset.burnFrom(address(escrow), UNITS / 2);
        assertEq(escrow.heldUnits(first), UNITS / 2);

        uint256 second = _open();

        assertEq(escrow.heldUnits(second), UNITS, "the new grant holds what it actually bought");
        assertEq(escrow.heldUnits(first), UNITS / 2, "and the old one is not diluted by it");

        vm.warp(block.timestamp + 5 * YEAR);
        vm.prank(alice);
        escrow.vest(second);
        assertApproxEqAbs(asset.balanceOf(alice), UNITS, 2);

        vm.prank(alice);
        escrow.vest(first);
        assertApproxEqAbs(asset.balanceOf(alice), UNITS + UNITS / 2, 2);
        assertLe(asset.balanceOf(address(escrow)), 2, "nothing stranded");
    }

    function test_aVestThatWouldRoundToNothingIsRefusedRatherThanBurningAShare() public {
        uint256 id = _open();

        // The pool is destroyed entirely. Shares are outstanding against nothing.
        asset.burnFrom(address(escrow), UNITS);
        vm.warp(block.timestamp + 5 * YEAR);

        assertEq(escrow.releasableUnits(id), 0);

        vm.prank(alice);
        vm.expectRevert(GrantEscrow.NothingDue.selector);
        escrow.vest(id);

        // And the grant is intact, so it still pays if the position is ever restored.
        asset.mint(address(escrow), UNITS);
        vm.prank(alice);
        escrow.vest(id);
        assertEq(asset.balanceOf(alice), UNITS);
    }

    function test_readingAGrantThatDoesNotExistIsRefused() public {
        vm.expectRevert(GrantEscrow.NoSuchGrant.selector);
        escrow.grant(42);
        vm.expectRevert(GrantEscrow.NoSuchGrant.selector);
        escrow.releasableUnits(42);
    }
}
