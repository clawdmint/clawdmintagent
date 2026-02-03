// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ClawdmintFactory} from "../src/ClawdmintFactory.sol";

contract DeployNew is Script {
    function run() external {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(key);
        
        console2.log("Deployer:", deployer);
        
        vm.startBroadcast(key);
        
        ClawdmintFactory factory = new ClawdmintFactory(
            deployer,  // treasury
            250,       // 2.5% platform fee
            deployer   // owner
        );
        
        vm.stopBroadcast();
        
        console2.log("Factory:", address(factory));
    }
}
