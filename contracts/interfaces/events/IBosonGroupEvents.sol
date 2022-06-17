// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";

/**
 * @title IBosonGroupEvents
 *
 * @notice Events related to management of groups within the protocol.
 */
interface IBosonGroupEvents {
    event GroupCreated(uint256 indexed groupId, uint256 indexed sellerId, BosonTypes.Group group, address indexed executedBy);
    event GroupUpdated(uint256 indexed groupId, uint256 indexed sellerId, BosonTypes.Group group, address indexed executedBy);
}
