// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";

/**
 * @title IBosonFundsEvents
 *
 * @notice Events related to management of funds within the protocol.
 */
interface IBosonFundsEvents {
    event FundsDeposited(uint256 indexed sellerId, address indexed depositedBy, address indexed tokenAddress, uint256 amount);  
}

interface IBosonFundsLibEvents {
    event FundsEncumbered(uint256 indexed entityId, address indexed exchangeToken, uint256 amount);
    event FundsWithdrawn(uint256 indexed sellerId, address indexed withdrawnTo, address indexed tokenAddress, uint256 amount);    
}
