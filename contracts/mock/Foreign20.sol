// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

/**
 * @title Foreign20
 *
 * @notice Mock ERC-(20) NFT for Unit Testing
 */
contract Foreign20 is ERC20Pausable {
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

    /**
     * Pause the token transfers
     */
    function pause() public {
        _pause();
    }

    /**
     * Deletes the contract code
     */
    function destruct() public {
        selfdestruct(payable(msg.sender));
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

/**
 * @title Foreign20 that takes a fee during the transfer
 *
 *
 * @notice Mock ERC-(20) for Unit Testing
 */
contract Foreign20WithFee is Foreign20 {
    uint256 private fee = 3;

    /**
     * @dev See {ERC20-_beforeTokenTransfer}.
     *
     * Burn part of the transferred value
     *
     */
    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        if (to != address(0) && from != address(0)) {
            uint256 _fee = (amount * fee) / 100;
            _burn(to, _fee);
        }
        super._afterTokenTransfer(from, to, amount);
    }

    function setFee(uint256 _newFee) external {
        fee = _newFee;
    }
}
