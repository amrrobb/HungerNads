// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title HNADSMock
/// @notice Mock ERC20 HNADS token for Monad testnet.
///         Public mint with no access control — hackathon simplicity.
///         Stands in for the real $HNADS token that will launch on nad.fun.
contract HNADSMock is ERC20 {
    constructor() ERC20("HungerNads Token", "HNADS") {}

    /// @notice Mint tokens to any address. No access control — testnet only.
    /// @param to Recipient address
    /// @param amount Amount to mint (18 decimals)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Burn own tokens (e.g. sponsorship burn simulation).
    /// @param amount Amount to burn
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
