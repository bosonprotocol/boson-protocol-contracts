// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";

/**
 * @title IBosonTwinEvents
 *
 * @notice Events related to management of twins within the protocol.
 */
interface IBosonTwinEvents {
    event TwinCreated(uint256 indexed twinId, uint256 indexed sellerId, BosonTypes.Twin twin, address indexed executedBy);
    event TwinDeleted(uint256 indexed twinId, uint256 indexed sellerId, address indexed executedBy);
}
