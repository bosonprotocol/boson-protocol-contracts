// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title Foreign20WithPermit
 *
 * @notice Test-only ERC-20 mock that implements EIP-2612 permit. Used to
 *         exercise BosonAuthorizedTransferForwarder's permit entry points.
 */
contract Foreign20WithPermit is ERC20Permit {
    constructor() ERC20("Foreign20WithPermit", "20Permit") ERC20Permit("Foreign20WithPermit") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
