// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Payroll} from "../src/Payroll.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

/**
 * Deploy Payroll against the real OKX router on X Layer.
 *
 * THE THREE ADDRESSES ARE IMMUTABLE ONCE THIS RUNS. The router is the only address the
 * contract will ever call and the spender is the only one it will ever approve, so getting
 * either wrong is not a configuration mistake to fix later — it is a redeploy. Both are
 * checked for code before anything is broadcast, because an EOA in either slot would
 * deploy cleanly and then fail every payment.
 *
 * The spender is NOT the router. It is `dexTokenApproveAddress` from the aggregator's
 * supported-chain call; `npx tsx scripts/router-addresses.ts` prints both.
 *
 *   forge script script/Deploy.s.sol --rpc-url $NEXT_PUBLIC_XLAYER_RPC --broadcast
 */
contract Deploy is Script {
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

        console.log("Payroll", address(payroll));
        console.log("Set NEXT_PUBLIC_PAYROLL_ADDRESS to that, then: npm run preflight");
    }
}
