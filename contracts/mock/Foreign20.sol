// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

/**
 * @title Foreign20
 *
 * @notice Mock ERC-(20) NFT for Unit Testing
 */
contract Foreign20 is ERC20Upgradeable {
    string public constant TOKEN_NAME = "Foreign20";
    string public constant TOKEN_SYMBOL = "20Test";

    /**
     * Mint some tokens
     * @param _account - address that gets the tokens
     * @param _amount - amount to mint
     */
    function mint(address _account, uint256 _amount) public {
        _mint(_account, _amount);
    }
}
