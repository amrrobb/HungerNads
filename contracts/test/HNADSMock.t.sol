// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {HNADSMock} from "../src/HNADSMock.sol";

contract HNADSMockTest is Test {
    HNADSMock public token;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    function setUp() public {
        token = new HNADSMock();
    }

    // ──────────────────────────────────────────────
    //  Metadata
    // ──────────────────────────────────────────────

    function test_name() public view {
        assertEq(token.name(), "HungerNads Token");
    }

    function test_symbol() public view {
        assertEq(token.symbol(), "HNADS");
    }

    function test_decimals() public view {
        assertEq(token.decimals(), 18);
    }

    // ──────────────────────────────────────────────
    //  Mint
    // ──────────────────────────────────────────────

    function test_mint_increasesBalance() public {
        token.mint(alice, 1000 ether);
        assertEq(token.balanceOf(alice), 1000 ether);
    }

    function test_mint_increasesTotalSupply() public {
        token.mint(alice, 500 ether);
        token.mint(bob, 300 ether);
        assertEq(token.totalSupply(), 800 ether);
    }

    function test_mint_anyoneCanMint() public {
        // Alice mints to herself
        vm.prank(alice);
        token.mint(alice, 100 ether);
        assertEq(token.balanceOf(alice), 100 ether);

        // Bob mints to himself
        vm.prank(bob);
        token.mint(bob, 200 ether);
        assertEq(token.balanceOf(bob), 200 ether);

        // Alice mints to Bob
        vm.prank(alice);
        token.mint(bob, 50 ether);
        assertEq(token.balanceOf(bob), 250 ether);
    }

    // ──────────────────────────────────────────────
    //  Burn
    // ──────────────────────────────────────────────

    function test_burn_decreasesBalance() public {
        token.mint(alice, 1000 ether);

        vm.prank(alice);
        token.burn(400 ether);

        assertEq(token.balanceOf(alice), 600 ether);
    }

    function test_burn_decreasesTotalSupply() public {
        token.mint(alice, 1000 ether);

        vm.prank(alice);
        token.burn(300 ether);

        assertEq(token.totalSupply(), 700 ether);
    }

    function test_burn_revertsOnInsufficientBalance() public {
        token.mint(alice, 100 ether);

        vm.prank(alice);
        vm.expectRevert();
        token.burn(200 ether);
    }

    // ──────────────────────────────────────────────
    //  Transfer
    // ──────────────────────────────────────────────

    function test_transfer() public {
        token.mint(alice, 1000 ether);

        vm.prank(alice);
        token.transfer(bob, 300 ether);

        assertEq(token.balanceOf(alice), 700 ether);
        assertEq(token.balanceOf(bob), 300 ether);
    }

    function test_transferFrom_withApproval() public {
        token.mint(alice, 1000 ether);

        vm.prank(alice);
        token.approve(bob, 500 ether);

        vm.prank(bob);
        token.transferFrom(alice, bob, 400 ether);

        assertEq(token.balanceOf(alice), 600 ether);
        assertEq(token.balanceOf(bob), 400 ether);
    }
}
