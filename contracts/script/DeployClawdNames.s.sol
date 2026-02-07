// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ClawdNames} from "../src/ClawdNames.sol";

/**
 * @title DeployClawdNames
 * @notice Deployment script for ClawdNames (.clawd name service)
 * @dev Usage:
 *   Base Mainnet:
 *     forge script script/DeployClawdNames.s.sol --rpc-url base --broadcast --verify
 *   Base Sepolia (testnet):
 *     forge script script/DeployClawdNames.s.sol --rpc-url base-sepolia --broadcast --verify
 */
contract DeployClawdNames is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address owner = vm.envOr("OWNER_ADDRESS", vm.addr(deployerPrivateKey));

        console2.log("=== ClawdNames Deployment ===");
        console2.log("Deployer:", vm.addr(deployerPrivateKey));
        console2.log("Treasury:", treasury);
        console2.log("Owner:", owner);
        console2.log("");

        vm.startBroadcast(deployerPrivateKey);

        ClawdNames names = new ClawdNames(treasury, owner);

        vm.stopBroadcast();

        console2.log("=== Deployment Complete ===");
        console2.log("ClawdNames Address:", address(names));
        console2.log("");
        console2.log("Pricing:");
        console2.log("  3 chars: 0.01 ETH");
        console2.log("  4 chars: 0.005 ETH");
        console2.log("  5+ chars: 0.001 ETH");
        console2.log("");
        console2.log("Next steps:");
        console2.log("1. Verify on Basescan");
        console2.log("2. Set NEXT_PUBLIC_CLAWD_NAMES_ADDRESS in .env");
    }
}
