// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title IBosonGroupEvents
 *
 * @notice Defines events related to management of groups within the protocol.
 */
interface IBosonGroupEvents {
    event GroupCreated(
        uint256 indexed groupId,
        uint256 indexed sellerId,
        BosonTypes.Group group,
        BosonTypes.Condition condition,
        address indexed executedBy
    );
    event GroupUpdated(
        uint256 indexed groupId,
        uint256 indexed sellerId,
        BosonTypes.Group group,
        BosonTypes.Condition condition,
        address indexed executedBy
    );
}
