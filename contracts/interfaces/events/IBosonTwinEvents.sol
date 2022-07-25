// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title IBosonTwinEvents
 *
 * @notice Events related to management of twins within the protocol.
 */
interface IBosonTwinEvents {
    event TwinCreated(
        uint256 indexed twinId,
        uint256 indexed sellerId,
        BosonTypes.Twin twin,
        address indexed executedBy
    );
    event TwinDeleted(uint256 indexed twinId, uint256 indexed sellerId, address indexed executedBy);
    // Amount must be 0 if token type is TokenType.NonFungible
    // tokenId must be 0 if token type is TokenType.Fungible
    event TwinTransferred(
        uint256 indexed twinId,
        address indexed tokenAddress,
        uint256 indexed tokenId,
        uint256 amount,
        address executedBy
    );
    event TwinTransferFailed(
        uint256 indexed twinId,
        address indexed tokenAddress,
        uint256 indexed tokenId,
        uint256 amount,
        address executedBy
    );
}
