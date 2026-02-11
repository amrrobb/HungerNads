// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {HNADSMock} from "../src/HNADSMock.sol";

/// @title DeployMockToken
/// @notice Deploys the HNADSMock ERC20 token to Monad testnet.
///
/// @dev Usage:
///   forge script script/DeployMockToken.s.sol:DeployMockToken \
///     --rpc-url $MONAD_RPC_URL \
///     --broadcast \
///     --private-key $DEPLOYER_KEY \
///     -vvvv
contract DeployMockToken is Script {
    function run() external {
        address deployer = msg.sender;

        console2.log("=== HNADS Mock Token Deployment ===");
        console2.log("Deployer:", deployer);
        console2.log("");

        vm.startBroadcast();

        HNADSMock token = new HNADSMock();
        console2.log("HNADSMock deployed at:", address(token));
        console2.log("  name:   ", token.name());
        console2.log("  symbol: ", token.symbol());
        console2.log("  decimals:", token.decimals());

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("Token:", address(token));
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. wrangler secret put HNADS_TOKEN_ADDRESS");
        console2.log("  2. Mint test tokens: token.mint(recipient, amount)");
    }
}
