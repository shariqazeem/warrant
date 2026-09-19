// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {GrantEscrow} from "../src/GrantEscrow.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {MockERC20, MockUSDT} from "./mocks/MockERC20.sol";
import {MockRouter, MockApproveProxy} from "./mocks/MockRouter.sol";

/**
 * THE SCHEDULE, AGAINST THE SAME FIXTURE THE TYPESCRIPT READS.
 *
 * lib/schedule.ts draws the bar on /grants and lib/schedule.test.ts checks it against
 * test/fixtures/schedule.json. This checks the contract against the same file. Neither
 * implementation can move without one of the two suites going red — which is the only
 * thing that stops a grant page from drawing a figure the contract will not honour.
 */
contract ScheduleTest is Test {
    GrantEscrow internal escrow;
    MockUSDT internal stable;
    MockERC20 internal asset;
    MockRouter internal router;
    MockApproveProxy internal proxy;

    address internal payer = makeAddr("payer");
    address internal alice = makeAddr("alice");

    string internal fixture;

    function setUp() public {
        fixture = vm.readFile("test/fixtures/schedule.json");

        stable = new MockUSDT();
        asset = new MockERC20("S&P 500 xStock", "SPYx", 18);
        proxy = new MockApproveProxy();
        router = new MockRouter(proxy);
        escrow = new GrantEscrow(IERC20(address(stable)), address(router), address(proxy));

        stable.mint(payer, 1_000_000e6);
        vm.prank(payer);
        stable.approve(address(escrow), type(uint256).max);
    }

    function test_theContractAgreesWithTheSharedFixture() public {
        uint256 shares = vm.parseJsonUint(fixture, ".shares");
        uint64 start = uint64(vm.parseJsonUint(fixture, ".start"));
        uint64 cliff = uint64(vm.parseJsonUint(fixture, ".cliffSeconds"));
        uint64 duration = uint64(vm.parseJsonUint(fixture, ".durationSeconds"));

        vm.warp(start - 1);

        uint256 id;
        {
            GrantEscrow.Terms memory t = GrantEscrow.Terms({
                beneficiary: alice,
                asset: address(asset),
                stableAmount: 10_000e6,
                minOut: 1,
                start: start,
                cliff: cliff,
                duration: duration,
                tipBps: 0,
                reasonHash: keccak256("fixture"),
                routerCalldata: abi.encodeCall(
                    MockRouter.swap, (address(stable), 10_000e6, address(asset), shares, address(escrow))
                )
            });
            vm.prank(payer);
            id = escrow.open(t);
        }

        // The first grant in an asset defines the share unit, so shares == units here and
        // the fixture's figures are directly comparable.
        assertEq(escrow.grant(id).shares, shares, "fixture shares");

        uint256[] memory times = vm.parseJsonUintArray(fixture, ".at");
        uint256[] memory wants = vm.parseJsonUintArray(fixture, ".vested");
        string[] memory notes = vm.parseJsonStringArray(fixture, ".notes");

        assertGt(times.length, 0, "the fixture has no points");
        assertEq(times.length, wants.length, "the fixture is ragged");
        assertEq(times.length, notes.length, "the fixture is ragged");

        for (uint256 i; i < times.length; i++) {
            assertEq(escrow.vestedSharesAt(id, times[i]), wants[i], notes[i]);
        }
    }
}
