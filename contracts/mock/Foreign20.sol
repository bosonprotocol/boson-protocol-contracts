// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Foreign20
 *
 * @notice Mock ERC-(20) NFT for Unit Testing
 */
contract Foreign20 is ERC20 {
    string public constant TOKEN_NAME = "Foreign20";
    string public constant TOKEN_SYMBOL = "20Test";

    constructor() ERC20(TOKEN_NAME, TOKEN_SYMBOL) {}

    /**
     * Mint some tokens
     * @param _account - address that gets the tokens
     * @param _amount - amount to mint
     */
    function mint(address _account, uint256 _amount) public {
        _mint(_account, _amount);
    }
}

/**
 * @title Foreign20 that fails when name() is called
 *
 * We need other ERC20 methods such as approve, transferFrom etc, so it's easier to just override the function that we don't want to succeed
 *
 * @notice Mock ERC-(20) NFT for Unit Testing
 */
contract Foreign20NoName is Foreign20 {
    function name() public pure override returns (string memory) {
        // simulate the contract without "name" implementation.
        revert();
    }
}
