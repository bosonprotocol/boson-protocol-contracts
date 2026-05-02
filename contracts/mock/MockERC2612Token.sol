// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title MockERC2612Token
 *
 * @notice Minimal ERC-20 + EIP-2612 (`permit`) implementation used in tests.
 * Backed by OpenZeppelin's audited `ERC20Permit` extension; just adds an open
 * `mint` for test setup.
 */
contract MockERC2612Token is ERC20Permit {
    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) ERC20Permit(_name) {}

    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }
}
