// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ClawdmintFactory} from "../src/ClawdmintFactory.sol";

/**
 * @title Deploy
 * @notice Deployment script for Clawdmint Factory contract
 * @dev Usage:
 *   Base Sepolia (testnet):
 *     forge script script/Deploy.s.sol --rpc-url base-sepolia --broadcast --verify
 *   
 *   Base Mainnet:
 *     forge script script/Deploy.s.sol --rpc-url base --broadcast --verify
 */
contract Deploy is Script {
    // Default configuration
    uint16 constant DEFAULT_PLATFORM_FEE_BPS = 250; // 2.5%

    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        
        // Optional: custom owner (defaults to deployer)
        address owner = vm.envOr("OWNER_ADDRESS", vm.addr(deployerPrivateKey));
        
        // Optional: custom platform fee
        uint16 platformFeeBps = uint16(vm.envOr("PLATFORM_FEE_BPS", uint256(DEFAULT_PLATFORM_FEE_BPS)));

        console2.log("=== Clawdmint Factory Deployment ===");
        console2.log("Deployer:", vm.addr(deployerPrivateKey));
        console2.log("Treasury:", treasury);
        console2.log("Owner:", owner);
        console2.log("Platform Fee (bps):", platformFeeBps);
        console2.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy the factory
        ClawdmintFactory factory = new ClawdmintFactory(
            treasury,
            platformFeeBps,
            owner
        );

        vm.stopBroadcast();

        console2.log("=== Deployment Complete ===");
        console2.log("Factory Address:", address(factory));
        console2.log("");
        console2.log("Next steps:");
        console2.log("1. Verify contract on block explorer");
        console2.log("2. Update NEXT_PUBLIC_FACTORY_ADDRESS in .env");
        console2.log("3. Transfer ownership to multisig if needed");
    }
}

/**
 * @title AddAgent
 * @notice Script to add an agent to the allowlist
 * @dev Usage:
 *   AGENT_ADDRESS=0x... forge script script/Deploy.s.sol:AddAgent --rpc-url base --broadcast
 */
contract AddAgent is Script {
    function run() external {
        uint256 ownerPrivateKey = vm.envUint("OWNER_PRIVATE_KEY");
        address factoryAddress = vm.envAddress("FACTORY_ADDRESS");
        address agentAddress = vm.envAddress("AGENT_ADDRESS");

        console2.log("Adding agent to allowlist...");
        console2.log("Factory:", factoryAddress);
        console2.log("Agent:", agentAddress);

        vm.startBroadcast(ownerPrivateKey);

        ClawdmintFactory factory = ClawdmintFactory(factoryAddress);
        factory.setAgentAllowed(agentAddress, true);

        vm.stopBroadcast();

        console2.log("Agent added successfully!");
    }
}
