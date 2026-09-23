// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Payroll} from "../src/Payroll.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

/**
 * Deploy Payroll ALONE, leaving GrantEscrow where it is.
 *
 * For a change to Payroll that GrantEscrow does not share — the per-line asset of 23 Sep,
 * which lets each person be paid in their own choice. The same three immutables as
 * Deploy.s.sol, checked the same way before anything is broadcast.
 *
 *   forge script script/DeployPayroll.s.sol --rpc-url $NEXT_PUBLIC_XLAYER_RPC --broadcast
 */
contract DeployPayroll is Script {
    function run() external returns (Payroll payroll) {
        address stable = vm.envAddress("NEXT_PUBLIC_STABLE");
        address router = vm.envAddress("OKX_ROUTER");
        address spender = vm.envAddress("OKX_ROUTER_SPENDER");

        require(stable.code.length > 0, "stable has no code");
        require(router.code.length > 0, "router has no code");
        require(spender.code.length > 0, "spender has no code");
        require(router != spender, "router and spender are the same; one of them is wrong");

        console.log("stable ", stable);
        console.log("router ", router);
        console.log("spender", spender);

        vm.startBroadcast();
        payroll = new Payroll(IERC20(stable), router, spender);
        vm.stopBroadcast();

        console.log("");
        console.log("NEXT_PUBLIC_PAYROLL_ADDRESS=", address(payroll));
    }
}
